// Add, read and delete learning materials (YouTube + PDF) and save them to the database.
'use server';

import { supabase } from './supabase';
import {
  getYouTubeTranscriptHybrid,
  parsePDF,
  processManualText,
} from './services';
import { extractVideoId, errorMessage } from './utils';
import { logger } from './logger';
import { PDF_MAX_SIZE_BYTES } from './constants';

// Check the given secret against the admin secret from the env.
function verifyAdminSecret(secret: string): boolean {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return false;
  return secret === expected;
}

// Shape of one material row in the database.
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

// Get all materials, newest first. Connection errors throw; other errors just
// log and return an empty list so the app keeps working.
export async function getMaterials(): Promise<Material[]> {
  // This build ships no demo materials, so demo mode returns nothing here.
  // (Demo deployments seed their own materials and use the cache path in quiz.ts.)
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
      error: errorMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    if (error instanceof Error && error.message.includes('Unable to connect to the database')) {
      throw error;
    }
    return [];
  }
}

// Get a single material by id, or null if it's missing.
export async function getMaterialById(id: string): Promise<Material | null> {
  // Same as getMaterials: this build has no demo materials.
  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return null;
    return data as Material;
  } catch (error: unknown) {
    logger.error('Failed to fetch material', { error: errorMessage(error), materialId: id });
    return null;
  }
}

// Add a YouTube material: fetch its transcript (or use pasted text), then save it.
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
      } catch (e) {
        // The title is optional (we fall back to a default), so just log it.
        logger.debug('Failed to fetch video title', { url, error: errorMessage(e) });
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
      error: errorMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
      url,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Add a PDF material: upload the file, pull out its text, then save it.
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

    const materialTitle = title || file.name.replace(/\.pdf$/i, '');
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
      error: errorMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
      fileName: file.name,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Delete a material by id (admin only).
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
      error: errorMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
      materialId: id,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

