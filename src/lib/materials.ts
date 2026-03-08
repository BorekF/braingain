'use server';

import { supabase } from './supabase';
import {
  getYouTubeTranscriptHybrid,
  parsePDF,
  processManualText,
} from './services';
import { extractVideoId } from './utils';
import { logger } from './logger';
import { PDF_MAX_SIZE_BYTES } from './constants';

function verifyAdminSecret(secret: string): boolean {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return false;
  return secret === expected;
}

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
 * Fetches all materials from the database, newest first.
 * On connection errors, throws; on other errors, returns [] and logs (graceful degradation).
 * (Demo mode with fixed materials is not included in this build; set NEXT_PUBLIC_DEMO_MODE only in demo deployments that include demo data.)
 */
export async function getMaterials(): Promise<Material[]> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to fetch materials', {
        error: error.message,
        code: error.code,
        details: error.details,
      });
      if (error.message?.includes('fetch failed') || error.message?.includes('ENOTFOUND')) {
        throw new Error(
          'Unable to connect to the database. Please check:\n' +
          '1. NEXT_PUBLIC_SUPABASE_URL is correct in .env.local\n' +
          '2. You have an internet connection\n' +
          '3. Your Supabase project is active'
        );
      }
      throw error;
    }

    return data || [];
  } catch (error: unknown) {
    logger.error('Failed to fetch materials', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    if (error instanceof Error && error.message.includes('Unable to connect to the database')) {
      throw error;
    }
    return [];
  }
}

/**
 * Adds a YouTube material: fetches transcript (or uses manual text), then persists to DB.
 */
export async function addYouTubeMaterial(
  url: string,
  startMinutes: number = 0,
  endMinutes?: number,
  manualText?: string,
  rewardMinutes?: number,
  adminSecret?: string
): Promise<{ success: boolean; error?: string; materialId?: string; requiresManual?: boolean }> {
  if (!verifyAdminSecret(adminSecret || '')) {
    logger.warn('Unauthorized attempt to add YouTube material', { url });
    return { success: false, error: 'Unauthorized' };
  }

  try {
    let contentText: string | null = null;
    let title = 'YouTube Video';

    if (manualText) {
      contentText = await processManualText(manualText);
      if (!contentText) {
        return {
          success: false,
          error: 'Text is too short or invalid (minimum 100 characters)',
        };
      }
    } else {
      const startSeconds = startMinutes * 60;
      const endSeconds = endMinutes !== undefined ? endMinutes * 60 : undefined;
      const result = await getYouTubeTranscriptHybrid(url, startSeconds, endSeconds);

      if (result.success && result.transcript) {
        contentText = result.transcript;
      } else {
        return {
          success: false,
          requiresManual: result.requiresManual,
          error:
            result.error ||
            'Failed to fetch the transcript. Please paste it manually.',
        };
      }

      try {
        const { Innertube } = await import('youtubei.js');
        const youtube = await Innertube.create();
        const videoId = extractVideoId(url);
        if (videoId) {
          const info = await youtube.getInfo(videoId);
          title = info.basic_info.title || title;
        }
      } catch (e: any) {
        const isParserError =
          e?.name === 'ParserError' ||
          e?.info !== undefined ||
          e?.message?.includes('Type mismatch') ||
          e?.message?.includes('Parser');
        
        if (isParserError) {
          logger.warn('YouTube.js: Parser error while fetching title', {
            url,
            error: e?.message || String(e),
            errorName: e?.name,
            errorDate: e?.date,
            errorVersion: e?.version,
          });
        } else {
          logger.debug('Failed to fetch video title', {
            url,
            error: e?.message || String(e),
          });
        }
      }
    }

    if (!contentText) {
      return {
        success: false,
        error: 'Failed to get material content',
      };
    }

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
      logger.error('Failed to save YouTube material', {
        error: error.message,
        code: error.code,
        details: error.details,
        url,
      });
      if (error.message?.includes('fetch failed') || error.message?.includes('ENOTFOUND')) {
        return {
          success: false,
          error:
            'Unable to connect to the database. Check your Supabase configuration in .env.local.',
        };
      }
      return {
        success: false,
        error: `Database write failed: ${error.message}`,
      };
    }

    return {
      success: true,
      materialId: data.id,
    };
  } catch (error: unknown) {
    logger.error('Failed to add YouTube material', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      url,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/** Adds a PDF material: uploads to storage, extracts text, persists to DB. */
export async function addPDFMaterial(
  file: File,
  title?: string,
  rewardMinutes?: number,
  adminSecret?: string
): Promise<{ success: boolean; error?: string; materialId?: string }> {
  if (!verifyAdminSecret(adminSecret || '')) {
    logger.warn('Unauthorized attempt to add PDF material', {
      fileName: file.name,
    });
    return { success: false, error: 'Unauthorized' };
  }

  try {
    if (file.type !== 'application/pdf') {
      return {
        success: false,
        error: 'File must be a PDF',
      };
    }

    if (file.size > PDF_MAX_SIZE_BYTES) {
      return {
        success: false,
        error: `File is too large (${(file.size / 1024 / 1024).toFixed(2)} MB). Maximum: ${PDF_MAX_SIZE_BYTES / 1024 / 1024} MB.`,
      };
    }

    const contentText = await parsePDF(file);
    if (!contentText) {
      return {
        success: false,
        error:
          'Failed to extract text from the PDF. Make sure the PDF contains selectable text (not just scanned images).',
      };
    }

    const materialTitle = title || file.name.replace('.pdf', '');
    const fileExt = file.name.split('.').pop() || 'pdf';
    const fileName = `${Date.now()}-${materialTitle.replace(/[^a-z0-9]/gi, '_')}.${fileExt}`;
    const filePath = `pdfs/${fileName}`;

    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const { error: storageError } = await supabase.storage
      .from('documents')
      .upload(filePath, uint8Array, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (storageError) {
      logger.error('Failed to upload PDF to Storage', {
        error: storageError.message,
        fileName: file.name,
        filePath,
      });
      return {
        success: false,
        error: `Failed to upload PDF: ${storageError.message}`,
      };
    }

    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(filePath);

    const pdfUrl = urlData.publicUrl;

    const { data, error } = await supabase
      .from('materials')
      .insert({
        title: materialTitle,
        type: 'pdf',
        content_text: contentText,
        video_url: pdfUrl,
        start_offset: 0,
        reward_minutes: rewardMinutes || null,
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to save PDF material', {
        error: error.message,
        code: error.code,
        details: error.details,
        fileName: file.name,
      });
      if (error.message?.includes('fetch failed') || error.message?.includes('ENOTFOUND')) {
        return {
          success: false,
          error:
            'Unable to connect to the database. Check your Supabase configuration in .env.local.',
        };
      }
      return {
        success: false,
        error: `Database write failed: ${error.message}`,
      };
    }

    return {
      success: true,
      materialId: data.id,
    };
  } catch (error: unknown) {
    logger.error('Failed to add PDF material', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      fileName: file.name,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Deletes a material by id. Requires admin secret.
 */
export async function deleteMaterial(
  id: string,
  adminSecret?: string
): Promise<{ success: boolean; error?: string }> {
  if (!verifyAdminSecret(adminSecret || '')) {
    logger.warn('Unauthorized attempt to delete material', { materialId: id });
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const { error } = await supabase.from('materials').delete().eq('id', id);

    if (error) {
      logger.error('Failed to delete material', {
        error: error.message,
        code: error.code,
        details: error.details,
        materialId: id,
      });
      return {
        success: false,
        error: `Delete failed: ${error.message}`,
      };
    }

    return { success: true };
  } catch (error: unknown) {
    logger.error('Failed to delete material', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      materialId: id,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

