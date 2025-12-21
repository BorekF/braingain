'use server';

import { supabase } from './supabase';
import {
  getYouTubeTranscriptHybrid,
  parsePDF,
  processManualText,
} from './services';
import { extractVideoId } from './utils';
import { logger } from './logger';

export interface Material {
  id: string;
  title: string;
  type: 'youtube' | 'pdf';
  content_text: string;
  video_url: string | null;
  start_offset: number;
  end_offset: number | null;
  reward_minutes: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * Pobiera wszystkie materiały z bazy danych
 */
export async function getMaterials(): Promise<Material[]> {
  try {
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Błąd pobierania materiałów', {
        error: error.message,
        code: error.code,
        details: error.details,
      });
      // Sprawdź czy to błąd połączenia
      if (error.message?.includes('fetch failed') || error.message?.includes('ENOTFOUND')) {
        throw new Error(
          'Nie można połączyć się z bazą danych. Sprawdź:\n' +
          '1. Czy NEXT_PUBLIC_SUPABASE_URL jest prawidłowy w .env.local\n' +
          '2. Czy masz połączenie z internetem\n' +
          '3. Czy projekt Supabase jest aktywny'
        );
      }
      throw error;
    }

    return data || [];
  } catch (error) {
    logger.error('Błąd pobierania materiałów', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    // Jeśli to nasz własny błąd, rzuć go dalej
    if (error instanceof Error && error.message.includes('Nie można połączyć się')) {
      throw error;
    }
    // W przeciwnym razie zwróć pustą tablicę (graceful degradation)
    return [];
  }
}

/**
 * Dodaje materiał z YouTube
 */
export async function addYouTubeMaterial(
  url: string,
  startMinutes: number = 0,
  endMinutes?: number,
  manualText?: string,
  rewardMinutes?: number
): Promise<{ success: boolean; error?: string; materialId?: string }> {
  try {
    let contentText: string | null = null;
    let title = 'YouTube Video';

    // Jeśli podano tekst ręczny, użyj go
    if (manualText) {
      contentText = await processManualText(manualText);
      if (!contentText) {
        return {
          success: false,
          error: 'Tekst jest zbyt krótki lub nieprawidłowy (minimum 100 znaków)',
        };
      }
    } else {
      // Próba automatycznego pobrania
      const startSeconds = startMinutes * 60;
      const endSeconds = endMinutes !== undefined ? endMinutes * 60 : undefined;
      const result = await getYouTubeTranscriptHybrid(url, startSeconds, endSeconds);

      if (result.success && result.transcript) {
        contentText = result.transcript;
      } else {
        return {
          success: false,
          error:
            result.error ||
            'Nie udało się pobrać transkryptu. Proszę wkleić tekst ręcznie.',
        };
      }

      // Próba pobrania tytułu wideo (opcjonalne)
      try {
        const { Innertube } = await import('youtubei.js');
        const youtube = await Innertube.create();
        const videoId = extractVideoId(url);
        if (videoId) {
          const info = await youtube.getInfo(videoId);
          title = info.basic_info.title || title;
        }
      } catch (e: any) {
        // Ignoruj błąd pobierania tytułu, ale zaloguj błędy parsowania
        const isParserError =
          e?.name === 'ParserError' ||
          e?.info !== undefined ||
          e?.message?.includes('Type mismatch') ||
          e?.message?.includes('Parser');
        
        if (isParserError) {
          logger.warn('YouTube.js: Błąd parsowania podczas pobierania tytułu', {
            url,
            error: e?.message || String(e),
            errorName: e?.name,
            errorDate: e?.date,
            errorVersion: e?.version,
          });
        } else {
          logger.debug('Nie udało się pobrać tytułu wideo', {
            url,
            error: e?.message || String(e),
          });
        }
      }
    }

    if (!contentText) {
      return {
        success: false,
        error: 'Nie udało się uzyskać treści materiału',
      };
    }

    // Zapisz do bazy
    const { data, error } = await supabase
      .from('materials')
      .insert({
        title,
        type: 'youtube',
        content_text: contentText,
        video_url: url,
        start_offset: startMinutes * 60,
        end_offset: endMinutes !== undefined ? endMinutes * 60 : null,
        reward_minutes: rewardMinutes || null,
      })
      .select()
      .single();

    if (error) {
      logger.error('Błąd zapisu materiału YouTube', {
        error: error.message,
        code: error.code,
        details: error.details,
        url,
      });
      // Sprawdź czy to błąd połączenia
      if (error.message?.includes('fetch failed') || error.message?.includes('ENOTFOUND')) {
        return {
          success: false,
          error:
            'Nie można połączyć się z bazą danych. Sprawdź konfigurację Supabase w .env.local',
        };
      }
      return {
        success: false,
        error: `Błąd zapisu do bazy: ${error.message}`,
      };
    }

    return {
      success: true,
      materialId: data.id,
    };
  } catch (error) {
    logger.error('Błąd dodawania materiału YouTube', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      url,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Nieznany błąd',
    };
  }
}

/**
 * Dodaje materiał z PDF
 */
export async function addPDFMaterial(
  file: File,
  title?: string,
  rewardMinutes?: number
): Promise<{ success: boolean; error?: string; materialId?: string }> {
  try {
    // Walidacja pliku
    if (file.type !== 'application/pdf') {
      return {
        success: false,
        error: 'Plik musi być w formacie PDF',
      };
    }

    // Limit rozmiaru (10 MB)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return {
        success: false,
        error: `Plik jest zbyt duży (${(file.size / 1024 / 1024).toFixed(2)} MB). Maksimum: 10 MB.`,
      };
    }

    // Parsowanie PDF
    const contentText = await parsePDF(file);
    if (!contentText) {
      return {
        success: false,
        error: 'Nie udało się wyciągnąć tekstu z PDF. Upewnij się, że PDF zawiera tekst (nie jest tylko skanem).',
      };
    }

    // Zapisz plik PDF do Supabase Storage
    const materialTitle = title || file.name.replace('.pdf', '');
    const fileExt = file.name.split('.').pop() || 'pdf';
    const fileName = `${Date.now()}-${materialTitle.replace(/[^a-z0-9]/gi, '_')}.${fileExt}`;
    const filePath = `pdfs/${fileName}`;

    // Konwersja File na ArrayBuffer, potem na Uint8Array dla Supabase Storage
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Upload do Storage
    const { error: storageError } = await supabase.storage
      .from('documents')
      .upload(filePath, uint8Array, {
        contentType: 'application/pdf',
        upsert: false, // Nie nadpisuj istniejących plików
      });

    if (storageError) {
      logger.error('Błąd zapisu pliku PDF do Storage', {
        error: storageError.message,
        fileName: file.name,
        filePath,
      });
      return {
        success: false,
        error: `Nie udało się zapisać pliku PDF: ${storageError.message}`,
      };
    }

    // Pobierz publiczny URL pliku
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(filePath);

    const pdfUrl = urlData.publicUrl;

    // Zapisz do bazy
    const { data, error } = await supabase
      .from('materials')
      .insert({
        title: materialTitle,
        type: 'pdf',
        content_text: contentText,
        video_url: pdfUrl, // Używamy video_url do przechowywania URL pliku PDF
        start_offset: 0,
        reward_minutes: rewardMinutes || null,
      })
      .select()
      .single();

    if (error) {
      logger.error('Błąd zapisu materiału PDF', {
        error: error.message,
        code: error.code,
        details: error.details,
        fileName: file.name,
      });
      // Sprawdź czy to błąd połączenia
      if (error.message?.includes('fetch failed') || error.message?.includes('ENOTFOUND')) {
        return {
          success: false,
          error:
            'Nie można połączyć się z bazą danych. Sprawdź konfigurację Supabase w .env.local',
        };
      }
      return {
        success: false,
        error: `Błąd zapisu do bazy: ${error.message}`,
      };
    }

    return {
      success: true,
      materialId: data.id,
    };
  } catch (error) {
    logger.error('Błąd dodawania materiału PDF', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      fileName: file.name,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Nieznany błąd',
    };
  }
}

/**
 * Usuwa materiał z bazy danych
 */
export async function deleteMaterial(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('materials').delete().eq('id', id);

    if (error) {
      logger.error('Błąd usuwania materiału', {
        error: error.message,
        code: error.code,
        details: error.details,
        materialId: id,
      });
      return {
        success: false,
        error: `Błąd usuwania: ${error.message}`,
      };
    }

    return { success: true };
  } catch (error) {
    logger.error('Błąd usuwania materiału', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      materialId: id,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Nieznany błąd',
    };
  }
}

