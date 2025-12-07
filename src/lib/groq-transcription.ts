'use server';

import Groq from 'groq-sdk';
import YTDlpWrap from 'yt-dlp-wrap';
import { extractVideoId } from './utils';
import { logger } from './logger';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Lazy initialization klienta Groq
let groqClient: Groq | null = null;

function getGroqClient(): Groq {
  if (!groqClient) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error(
        'GROQ_API_KEY nie jest ustawiony w zmiennych środowiskowych. Sprawdź plik .env.local'
      );
    }
    groqClient = new Groq({ apiKey });
  }
  return groqClient;
}

/**
 * Pobiera ścieżkę audio z wideo YouTube używając yt-dlp
 * @param url - URL wideo YouTube
 * @param startSeconds - Czas startu w sekundach (opcjonalnie, do przycięcia audio)
 * @returns Ścieżka do pliku audio lub null w przypadku błędu
 */
export async function downloadYouTubeAudio(
  url: string,
  startSeconds: number = 0
): Promise<string | null> {
  try {
    const videoId = extractVideoId(url);
    if (!videoId) {
      throw new Error('Nieprawidłowy URL YouTube');
    }

    // Utwórz tymczasowy katalog dla plików audio
    const tempDir = path.join(os.tmpdir(), 'braingain-audio');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const outputPath = path.join(tempDir, `${videoId}-${Date.now()}.%(ext)s`);

    // Inicjalizuj yt-dlp-wrap
    const ytDlpWrap = new YTDlpWrap();

    logger.info('Pobieranie audio z YouTube', { url, videoId, startSeconds });

    // Pobierz tylko audio bezpośrednio w formacie, który YouTube oferuje (bez konwersji)
    // Używamy formatu audio, który nie wymaga ffmpeg (opus, m4a, webm)
    // Groq API akceptuje: mp3, wav, m4a, opus, webm
    // Format: bestaudio[ext=m4a]/bestaudio[ext=opus]/bestaudio - najlepsza jakość audio bez konwersji
    const options = [
      '-f', 'bestaudio[ext=m4a]/bestaudio[ext=opus]/bestaudio', // Pobierz najlepsze audio bez konwersji (m4a lub opus)
      '--output', outputPath,
      '--no-playlist',
      '--quiet', // Mniej outputu w logach
      '--extractor-args', 'youtube:player_client=default', // Unikaj ostrzeżeń o JavaScript runtime
    ];

    // Jeśli mamy startSeconds, możemy przyciąć audio (ale to wymaga dodatkowego przetwarzania)
    // Na razie pobieramy całe audio, filtrowanie zrobimy w transkrypcji

    await ytDlpWrap.execPromise([url, ...options]);

    // Znajdź pobrany plik (yt-dlp może zmienić rozszerzenie)
    const files = fs.readdirSync(tempDir);
    const audioFile = files.find(f => f.startsWith(`${videoId}-`));
    
    if (!audioFile) {
      throw new Error('Nie udało się znaleźć pobranego pliku audio');
    }

    const fullPath = path.join(tempDir, audioFile);
    logger.info('Audio pobrane pomyślnie', { path: fullPath, size: fs.statSync(fullPath).size });

    return fullPath;
  } catch (error) {
    logger.error('Błąd pobierania audio z YouTube', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      url,
    });
    return null;
  }
}

/**
 * Usuwa plik audio z dysku
 * @param filePath - Ścieżka do pliku
 */
function cleanupAudioFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.debug('Usunięto plik audio', { path: filePath });
    }
  } catch (error) {
    logger.warn('Błąd usuwania pliku audio', {
      error: error instanceof Error ? error.message : String(error),
      path: filePath,
    });
  }
}

/**
 * Transkrybuje plik audio używając Groq API (Whisper-large-v3)
 * @param audioFilePath - Ścieżka do pliku audio
 * @param startSeconds - Czas startu w sekundach (do filtrowania segmentów)
 * @returns Transkrypt jako string lub null w przypadku błędu
 */
export async function transcribeWithGroq(
  audioFilePath: string,
  startSeconds: number = 0
): Promise<string | null> {
  let audioStream: fs.ReadStream | null = null;
  
  try {
    if (!fs.existsSync(audioFilePath)) {
      throw new Error(`Plik audio nie istnieje: ${audioFilePath}`);
    }

    // Sprawdź rozmiar pliku (Groq ma limit 25MB)
    const stats = fs.statSync(audioFilePath);
    const fileSizeMB = stats.size / (1024 * 1024);
    
    if (fileSizeMB > 25) {
      logger.warn('Plik audio jest zbyt duży dla Groq API', {
        size: fileSizeMB,
        path: audioFilePath,
      });
      // Możemy podzielić plik na części, ale na razie zwróćmy błąd
      throw new Error(
        `Plik audio jest zbyt duży (${fileSizeMB.toFixed(2)} MB). Maksimum: 25 MB. ` +
        'Spróbuj użyć krótszego fragmentu wideo.'
      );
    }

    const groq = getGroqClient();
    
    logger.info('Rozpoczynam transkrypcję przez Groq API', {
      path: audioFilePath,
      size: fileSizeMB,
      startSeconds,
    });

    // Wczytaj plik jako ReadStream (Groq SDK akceptuje ReadStream, File, Blob lub Buffer)
    audioStream = fs.createReadStream(audioFilePath);

    // Wywołaj API Groq
    // Groq SDK w Node.js akceptuje ReadStream, File, Blob lub Buffer
    const transcription = await groq.audio.transcriptions.create({
      file: audioStream as any, // ReadStream jest akceptowany przez Groq SDK
      model: 'whisper-large-v3', // Najlepszy model dla języka polskiego
      response_format: 'verbose_json', // Zwraca segmenty z czasami!
      language: 'pl', // Wymuszenie polskiego pomaga przy bełkotliwych nagraniach
      timestamp_granularities: ['segment'], // Zwraca segmenty z timestampami
    });

    // Zamknij stream po użyciu
    audioStream.close();

    // Mapowanie odpowiedzi Groq na format z segmentami
    // Groq zwraca obiekt z właściwością 'segments' zawierającą tablicę segmentów
    const segments = (transcription as any).segments || [];
    
    if (!segments || segments.length === 0) {
      // Fallback: jeśli nie ma segmentów, użyj tekstu bezpośrednio
      const text = (transcription as any).text || '';
      if (text && text.trim().length > 0) {
        logger.info('Transkrypcja zakończona (bez segmentów)', {
          textLength: text.length,
        });
        return text.trim();
      }
      throw new Error('Brak transkryptu w odpowiedzi z Groq API');
    }

    // Filtrowanie segmentów po czasie startu
    const startMs = startSeconds * 1000;
    const filteredSegments = segments.filter((seg: any) => {
      // seg.start i seg.end są w sekundach, konwertujemy na milisekundy
      const segStartMs = (seg.start || 0) * 1000;
      const segEndMs = (seg.end || 0) * 1000;
      // Bierzemy segmenty, które kończą się po startSeconds
      return segEndMs >= startMs;
    });

    if (filteredSegments.length === 0) {
      throw new Error('Brak segmentów transkryptu po zadanym czasie startu');
    }

    // Połączenie tekstu z segmentów
    const transcript = filteredSegments
      .map((seg: any) => seg.text || '')
      .filter((text: string) => text.trim().length > 0)
      .join(' ');

    logger.info('Transkrypcja zakończona pomyślnie', {
      totalSegments: segments.length,
      filteredSegments: filteredSegments.length,
      transcriptLength: transcript.length,
    });

    return transcript.trim();
  } catch (error) {
    // Zamknij stream jeśli jest otwarty
    if (audioStream) {
      audioStream.close();
    }
    
    logger.error('Błąd transkrypcji przez Groq API', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      audioFilePath,
    });
    return null;
  } finally {
    // Usuń plik audio po transkrypcji (oszczędność miejsca)
    cleanupAudioFile(audioFilePath);
  }
}

/**
 * Kompletna funkcja: pobiera audio i transkrybuje przez Groq
 * @param url - URL wideo YouTube
 * @param startSeconds - Czas startu w sekundach
 * @returns Transkrypt jako string lub null w przypadku błędu
 */
export async function getYouTubeTranscriptWithGroq(
  url: string,
  startSeconds: number = 0
): Promise<string | null> {
  try {
    logger.info('Rozpoczynam proces transkrypcji przez Groq', { url, startSeconds });

    // Krok 1: Pobierz audio
    const audioPath = await downloadYouTubeAudio(url, startSeconds);
    if (!audioPath) {
      return null;
    }

    // Krok 2: Transkrybuj przez Groq
    const transcript = await transcribeWithGroq(audioPath, startSeconds);
    
    return transcript;
  } catch (error) {
    logger.error('Błąd w procesie transkrypcji przez Groq', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      url,
    });
    return null;
  }
}

