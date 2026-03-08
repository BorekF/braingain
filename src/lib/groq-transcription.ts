'use server';

import Groq from 'groq-sdk';
import YTDlpWrap from 'yt-dlp-wrap';
import { extractVideoId } from './utils';
import { logger } from './logger';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Lazy Groq client initialization
let groqClient: Groq | null = null;

function getGroqClient(): Groq {
  if (!groqClient) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error(
        'GROQ_API_KEY is not set in environment variables. Check your .env.local file.'
      );
    }
    groqClient = new Groq({ apiKey });
  }
  return groqClient;
}

/**
 * Downloads audio from YouTube video using yt-dlp
 * @param url - YouTube video URL
 * @param startSeconds - Start time in seconds (optional, for trimming)
 * @param endSeconds - End time in seconds (optional, for trimming)
 * @returns Path to audio file or null on error
 */
export async function downloadYouTubeAudio(
  url: string,
  startSeconds: number = 0,
  endSeconds?: number
): Promise<string | null> {
  try {
    const videoId = extractVideoId(url);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    const tempDir = path.join(os.tmpdir(), 'braingain-audio');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const outputPath = path.join(tempDir, `${videoId}-${Date.now()}.%(ext)s`);
    const ytDlpWrap = new YTDlpWrap();

    logger.info('Downloading audio from YouTube', { url, videoId, startSeconds, endSeconds });

    // Best audio without conversion (m4a/opus); Groq accepts mp3, wav, m4a, opus, webm
    const options = [
      '-f', 'bestaudio[ext=m4a]/bestaudio[ext=opus]/bestaudio',
      '--output', outputPath,
      '--no-playlist',
      '--quiet',
      '--extractor-args', 'youtube:player_client=tv_embedded', // Bypasses PO token and n-challenge
    ];

    await ytDlpWrap.execPromise([url, ...options]);

    // yt-dlp may change extension; find the downloaded file
    const files = fs.readdirSync(tempDir);
    const audioFile = files.find(f => f.startsWith(`${videoId}-`));
    
    if (!audioFile) {
      throw new Error('Could not find downloaded audio file');
    }

    const fullPath = path.join(tempDir, audioFile);
    logger.info('Audio downloaded successfully', { path: fullPath, size: fs.statSync(fullPath).size });

    return fullPath;
  } catch (error) {
    logger.error('Failed to download audio from YouTube', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      url,
    });
    return null;
  }
}

/**
 * Removes audio file from disk
 * @param filePath - Path to file
 */
function cleanupAudioFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.debug('Deleted audio file', { path: filePath });
    }
  } catch (error) {
    logger.warn('Failed to delete audio file', {
      error: error instanceof Error ? error.message : String(error),
      path: filePath,
    });
  }
}

/**
 * Transcribes audio using Groq API (Whisper-large-v3)
 * @param audioFilePath - Path to audio file
 * @param startSeconds - Start time in seconds (for segment filtering)
 * @param endSeconds - End time in seconds (optional, for segment filtering)
 * @returns Transcript string or null on error
 */
export async function transcribeWithGroq(
  audioFilePath: string,
  startSeconds: number = 0,
  endSeconds?: number
): Promise<string | null> {
  let audioStream: fs.ReadStream | null = null;
  
  try {
    if (!fs.existsSync(audioFilePath)) {
      throw new Error(`Audio file does not exist: ${audioFilePath}`);
    }

    // Groq has 25MB limit
    const stats = fs.statSync(audioFilePath);
    const fileSizeMB = stats.size / (1024 * 1024);
    
    if (fileSizeMB > 25) {
      logger.warn('Audio file is too large for Groq API', {
        size: fileSizeMB,
        path: audioFilePath,
      });
      throw new Error(
        `Audio file is too large (${fileSizeMB.toFixed(2)} MB). Maximum: 25 MB. ` +
        'Try using a shorter video segment.'
      );
    }

    const groq = getGroqClient();
    
    logger.info('Starting Groq transcription', {
      path: audioFilePath,
      size: fileSizeMB,
      startSeconds,
      endSeconds,
    });

    audioStream = fs.createReadStream(audioFilePath);

    const transcription = await groq.audio.transcriptions.create({
      file: audioStream as any,
      model: 'whisper-large-v3', // Best for Polish
      response_format: 'verbose_json', // Returns segments with timestamps
      language: 'pl', // Improves accuracy on unclear recordings
      timestamp_granularities: ['segment'],
    });

    audioStream.close();

    const segments = (transcription as any).segments || [];
    
    if (!segments || segments.length === 0) {
      // Fallback: use raw text when no segments
      const text = (transcription as any).text || '';
      if (text && text.trim().length > 0) {
        logger.info('Transcription completed (no segments)', {
          textLength: text.length,
        });
        return text.trim();
      }
      throw new Error('No transcript in Groq API response');
    }

    // Filter segments by time range
    const startMs = startSeconds * 1000;
    const endMs = endSeconds !== undefined ? endSeconds * 1000 : undefined;
    
    const filteredSegments = segments.filter((seg: any) => {
      const segStartMs = (seg.start || 0) * 1000;
      const segEndMs = (seg.end || 0) * 1000;

      if (segEndMs < startMs) return false;
      if (endMs !== undefined && segStartMs >= endMs) {
        return false;
      }
      return true;
    });

    if (filteredSegments.length === 0) {
      const rangeDesc = endSeconds !== undefined 
        ? `in range ${startSeconds}s - ${endSeconds}s` 
        : `after ${startSeconds}s`;
      throw new Error(`No transcript segments ${rangeDesc}`);
    }

    const transcript = filteredSegments
      .map((seg: any) => seg.text || '')
      .filter((text: string) => text.trim().length > 0)
      .join(' ');

    logger.info('Transcription completed successfully', {
      totalSegments: segments.length,
      filteredSegments: filteredSegments.length,
      transcriptLength: transcript.length,
    });

    return transcript.trim();
  } catch (error) {
    if (audioStream) {
      audioStream.close();
    }
    
    logger.error('Groq transcription failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      audioFilePath,
    });
    return null;
  } finally {
    cleanupAudioFile(audioFilePath);
  }
}

/**
 * Full pipeline: downloads audio and transcribes via Groq
 * @param url - YouTube video URL
 * @param startSeconds - Start time in seconds
 * @param endSeconds - End time in seconds (optional)
 * @returns Transcript string or null on error
 */
export async function getYouTubeTranscriptWithGroq(
  url: string,
  startSeconds: number = 0,
  endSeconds?: number
): Promise<string | null> {
  try {
    logger.info('Starting Groq transcription pipeline', { url, startSeconds, endSeconds });

    const audioPath = await downloadYouTubeAudio(url, startSeconds, endSeconds);
    if (!audioPath) return null;

    const transcript = await transcribeWithGroq(audioPath, startSeconds, endSeconds);
    
    return transcript;
  } catch (error) {
    logger.error('Groq transcription pipeline failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      url,
    });
    return null;
  }
}

