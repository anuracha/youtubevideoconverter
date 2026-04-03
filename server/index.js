import express from 'express';
import cors from 'cors';
import https from 'https';
import http from 'http';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { v4 as uuid } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import youtubedl from 'youtube-dl-exec';

// Set ffmpeg path from bundled binary
ffmpeg.setFfmpegPath(ffmpegStatic);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;

// Temp directory for processing
const TEMP_DIR = path.join(os.tmpdir(), 'clipsync-temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json());

// ---- Helpers ----
function extractVideoId(url) {
  const patterns = [
    /(?:v=|\/v\/|youtu\.be\/|\/embed\/|\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    }, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpsGet(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode, data, headers: res.headers }));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function httpsGetStream(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpsGetStream(res.headers.location).then(resolve).catch(reject);
      }
      resolve(res);
    }).on('error', reject);
  });
}

// Fetch video info using YouTube's page data (innertube)
async function fetchVideoInfo(videoId) {
  // Try oEmbed first for basic info
  const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
  let title = 'Unknown Video';
  let author = 'Unknown';

  try {
    const oembedRes = await httpsGet(oembedUrl);
    if (oembedRes.statusCode === 200) {
      const oData = JSON.parse(oembedRes.data);
      title = oData.title || title;
      author = oData.author_name || author;
    }
  } catch (e) {
    console.warn('oEmbed failed:', e.message);
  }

  // Fetch the YouTube page to get more details
  const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const pageRes = await httpsGet(pageUrl);

  let duration = 0;
  let views = 0;
  let likes = 0;
  let thumbnail = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;

  if (pageRes.statusCode === 200) {
    const html = pageRes.data;

    // Try to extract from player response JSON embedded in page
    const playerRespMatch = html.match(/var ytInitialPlayerResponse\s*=\s*({.*?});/s);
    if (playerRespMatch) {
      try {
        const playerData = JSON.parse(playerRespMatch[1]);
        const videoDetails = playerData.videoDetails;
        if (videoDetails) {
          title = videoDetails.title || title;
          duration = parseInt(videoDetails.lengthSeconds) || 0;
          views = parseInt(videoDetails.viewCount) || 0;
          author = videoDetails.author || author;
          if (videoDetails.thumbnail?.thumbnails?.length) {
            thumbnail = videoDetails.thumbnail.thumbnails.pop().url;
          }
        }

        // Extract streaming data for download
        const streamingData = playerData.streamingData;
        let formats = [];
        if (streamingData) {
          formats = [
            ...(streamingData.formats || []),
            ...(streamingData.adaptiveFormats || []),
          ];
        }

        return {
          videoId,
          title,
          author,
          thumbnail,
          duration,
          views,
          likes,
          url: pageUrl,
          formats: formats.map(f => ({
            itag: f.itag,
            mimeType: f.mimeType,
            quality: f.qualityLabel || f.quality,
            bitrate: f.bitrate,
            url: f.url,
            signatureCipher: f.signatureCipher,
            contentLength: f.contentLength,
            width: f.width,
            height: f.height,
            audioQuality: f.audioQuality,
          })),
        };
      } catch (e) {
        console.warn('Failed to parse player response:', e.message);
      }
    }
  }

  return {
    videoId,
    title,
    author,
    thumbnail,
    duration,
    views,
    likes,
    url: pageUrl,
    formats: [],
  };
}

// ---- API: Get Video Info ----
app.post('/api/info', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    console.log(`Fetching info for video: ${videoId}`);
    const info = await fetchVideoInfo(videoId);

    // Return info without the full format list
    res.json({
      url: info.url,
      videoId: info.videoId,
      title: info.title,
      thumbnail: info.thumbnail,
      duration: info.duration,
      views: info.views,
      likes: info.likes,
      author: info.author,
      hasFormats: info.formats.length > 0,
    });
  } catch (err) {
    console.error('Error fetching video info:', err.message);
    res.status(500).json({
      error: 'Failed to fetch video info. The video may be unavailable or restricted.',
    });
  }
});

// ---- API: Download & Trim ----
app.post('/api/download', async (req, res) => {
  const { url, format, quality, startTime, endTime } = req.body;
  const jobId = uuid();
  const outputExt = format === 'mp4' ? 'mp4' : 'mp3';
  const outputPath = path.join(TEMP_DIR, `${jobId}.${outputExt}`);

  try {
    const videoId = extractVideoId(url);
    if (!videoId) {
      return res.status(400).json({ error: 'Invalid URL' });
    }

    const duration = (endTime || 0) - (startTime || 0);
    if (duration <= 0) {
      return res.status(400).json({ error: 'Invalid time range' });
    }

    console.log(`[${jobId}] Starting: ${format} | ${quality} | ${startTime}s-${endTime}s`);

    // We use youtube-dl-exec to reliably get the stream URL, bypassing signature cipher issues
    console.log(`[${jobId}] Extracting stream URL with yt-dlp...`);
    
    let ytFormatArg = 'bestaudio';
    if (format === 'mp4') {
      const height = parseInt(quality) || 720;
      ytFormatArg = `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`;
    }

    let streamUrls = '';
    try {
      streamUrls = await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
        getUrl: true,
        format: ytFormatArg,
      });
    } catch (err) {
      console.error(`[${jobId}] yt-dlp extraction failed:`, err.message);
      return res.status(500).json({ error: 'Failed to extract stream URL. The video might be protected.' });
    }

    // Split URLs (could be one for audio, or two for video+audio)
    const urls = streamUrls.trim().split('\n');
    const primaryUrl = urls[0];
    const audioUrl = urls.length > 1 ? urls[1] : null;

    if (!primaryUrl) {
      return res.status(500).json({ error: 'Could not resolve stream URL.' });
    }

    console.log(`[${jobId}] Stream URLs extracted successfully`);

    // Download and process with ffmpeg
    await new Promise((resolve, reject) => {
      const command = ffmpeg(primaryUrl);
      
      // If we have separate audio stream, add it as second input
      if (audioUrl) {
        command.input(audioUrl);
      }

      command
        .setStartTime(startTime || 0)
        .setDuration(duration);

      if (format === 'mp3') {
        const bitrateMap = { '128': '128k', '192': '192k', '320': '320k' };
        command
          .audioCodec('libmp3lame')
          .audioBitrate(bitrateMap[quality] || '192k')
          .format('mp3');
      } else {
        command
          .videoCodec('libx264')
          .audioCodec('aac')
          .outputOptions(['-movflags', 'frag_keyframe+empty_moov', '-preset', 'ultrafast'])
          .format('mp4');
      }

      command
        .on('start', () => console.log(`[${jobId}] FFmpeg started`))
        .on('progress', (p) => {
          if (p.percent) console.log(`[${jobId}] Progress: ${Math.round(p.percent)}%`);
        })
        .on('error', (err) => {
          console.error(`[${jobId}] FFmpeg error:`, err.message);
          reject(err);
        })
        .on('end', () => {
          console.log(`[${jobId}] FFmpeg done`);
          resolve();
        })
        .save(outputPath);
    });

    // Send the file
    const stat = fs.statSync(outputPath);
    const filename = `clip_${jobId.slice(0, 8)}.${outputExt}`;
    res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', stat.size);

    const fileStream = fs.createReadStream(outputPath);
    fileStream.pipe(res);

    fileStream.on('end', () => {
      setTimeout(() => {
        fs.unlink(outputPath, (err) => {
          if (err) console.warn(`[${jobId}] Cleanup warning:`, err.message);
          else console.log(`[${jobId}] Cleaned up`);
        });
      }, 5000);
    });

    fileStream.on('error', (err) => {
      console.error(`[${jobId}] Stream error:`, err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to send file' });
      }
    });
  } catch (err) {
    console.error(`[${jobId}] Error:`, err.message);
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Download/processing failed. Please try again.' });
    }
  }
});

// ---- Health Check ----
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---- Start Server ----
app.listen(PORT, () => {
  console.log(`\n  🎬 ClipSync API Server`);
  console.log(`  ➜ Running on http://localhost:${PORT}`);
  console.log(`  ➜ Temp dir: ${TEMP_DIR}`);
  console.log(`  ➜ FFmpeg: ${ffmpegStatic}\n`);
});
