'use server';

import { supabase } from './supabase';
import { logger } from './logger';

export async function getTotalRewards(): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('rewards')
      .select('minutes');

    if (error) {
      logger.error('Failed to fetch rewards', {
        error: error.message,
        code: error.code,
      });
      return 0;
    }

    if (!data || data.length === 0) {
      return 0;
    }

    // Sumuj wszystkie minuty
    const total = data.reduce((sum, reward) => sum + reward.minutes, 0);
    return total;
  } catch (error) {
    logger.error('Failed to fetch rewards', {
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}


