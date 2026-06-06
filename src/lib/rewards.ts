// Adds up all the reward minutes the student has earned so far.
'use server';

import { supabase } from './supabase';
import { logger } from './logger';
import { errorMessage } from './utils';

// Returns the total reward minutes from every row, or 0 on any problem.
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

    // Add up the minutes from every reward row.
    const total = data.reduce((sum, reward) => sum + reward.minutes, 0);
    return total;
  } catch (error) {
    logger.error('Failed to fetch rewards', { error: errorMessage(error) });
    return 0;
  }
}

