'use server';

import { headers } from 'next/headers';
import { supabase } from './supabase';
import { generateQuiz, type Quiz } from './services';
import { getMaterials } from './materials';
import { calculateRewardMinutes } from './utils';
import { logger } from './logger';

import { COOLDOWN_MINUTES, PASSING_PERCENTAGE } from './constants';

const COOLDOWN_SECONDS = COOLDOWN_MINUTES * 60;

const RATE_LIMIT_MAX = parseInt(process.env.DEMO_RATE_LIMIT_MAX || '5', 10);
const RATE_LIMIT_WINDOW_HOURS = 24;


export interface CooldownStatus {
  allowed: boolean;
  remainingSeconds?: number;
  lastAttempt?: string;
}

export interface QuizResult {
  success: boolean;
  score?: number;
  passed?: boolean;
  error?: string;
  rewardMinutes?: number;
  passingScore?: number;
  totalQuestions?: number;
}

async function getClientIp(): Promise<string> {
  const headersList = await headers();
  return (
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headersList.get('x-real-ip') ||
    'unknown'
  );
}

async function checkAndIncrementRateLimit(
  ip: string
): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const windowStart = new Date(
      Date.now() - RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000
    ).toISOString();

    const { count } = await supabase
      .from('rate_limits')
      .select('id', { count: 'exact', head: true })
      .eq('ip', ip)
      .eq('action', 'quiz_generate')
      .gte('created_at', windowStart);

    const currentCount = count ?? 0;
    if (currentCount >= RATE_LIMIT_MAX) {
      return { allowed: false, remaining: 0 };
    }

    await supabase.from('rate_limits').insert({ ip, action: 'quiz_generate' });
    return { allowed: true, remaining: RATE_LIMIT_MAX - currentCount - 1 };
  } catch (error) {
    logger.warn('Rate limit check failed, allowing request', {
      error: error instanceof Error ? error.message : String(error),
      ip,
    });
    return { allowed: true, remaining: RATE_LIMIT_MAX };
  }
}

async function getCachedQuiz(materialId: string): Promise<Quiz | null> {
  try {
    const { data, error } = await supabase
      .from('quizzes')
      .select('questions')
      .eq('material_id', materialId)
      .single();

    if (error || !data) return null;
    return { questions: data.questions } as Quiz;
  } catch {
    return null;
  }
}

async function cacheQuiz(materialId: string, quiz: Quiz): Promise<void> {
  try {
    await supabase
      .from('quizzes')
      .upsert(
        { material_id: materialId, questions: quiz.questions },
        { onConflict: 'material_id' }
      );
  } catch (error) {
    logger.warn('Failed to cache quiz', {
      error: error instanceof Error ? error.message : String(error),
      materialId,
    });
  }
}

/** Checks if quiz can be attempted (cooldown after failed attempt). */
export async function checkCooldown(materialId: string): Promise<CooldownStatus> {
  try {
    const { data, error } = await supabase
      .from('attempts')
      .select('created_at')
      .eq('material_id', materialId)
      .eq('passed', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned (expected)
      logger.error('Failed to check cooldown', {
        error: error.message,
        materialId,
      });
      // On error, allow attempt (graceful degradation)
      return { allowed: true };
    }

    if (!data) {
      return { allowed: true };
    }

    const lastAttemptTime = new Date(data.created_at).getTime();
    const now = Date.now();
    const elapsedSeconds = Math.floor((now - lastAttemptTime) / 1000);

    if (elapsedSeconds >= COOLDOWN_SECONDS) {
      return { allowed: true };
    }

    const remainingSeconds = COOLDOWN_SECONDS - elapsedSeconds;
    return {
      allowed: false,
      remainingSeconds,
      lastAttempt: data.created_at,
    };
  } catch (error) {
    logger.error('Failed to check cooldown', {
      error: error instanceof Error ? error.message : String(error),
      materialId,
    });
    return { allowed: true };
  }
}

/** Checks if material was already passed. */
export async function checkMaterialPassed(materialId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('attempts')
      .select('id')
      .eq('material_id', materialId)
      .eq('passed', true)
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.error('Failed to check material completion', {
        error: error.message,
        materialId,
      });
      return false;
    }

    return !!data;
  } catch (error) {
    logger.error('Failed to check material completion', {
      error: error instanceof Error ? error.message : String(error),
      materialId,
    });
    return false;
  }
}

/** Generates quiz for material (checks cooldown, serves from cache or generates via OpenAI). */
export async function startQuiz(materialId: string): Promise<{
  success: boolean;
  quiz?: Quiz;
  error?: string;
  cooldown?: CooldownStatus;
}> {
  try {
    const cooldown = await checkCooldown(materialId);
    if (!cooldown.allowed) {
      return {
        success: false,
        error: 'Please wait before trying again',
        cooldown,
      };
    }

    const materials = await getMaterials();
    const material = materials.find((m) => m.id === materialId);
    if (!material) {
      return {
        success: false,
        error: 'Material not found',
      };
    }

    const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

    if (isDemoMode) {
      // Demo mode: serve cached quiz, rate-limit first-time generation
      const cachedQuiz = await getCachedQuiz(materialId);
      if (cachedQuiz) {
        logger.info('Serving quiz from cache', { materialId });
        return { success: true, quiz: cachedQuiz };
      }

      const ip = await getClientIp();
      const rateLimit = await checkAndIncrementRateLimit(ip);
      if (!rateLimit.allowed) {
        logger.warn('Rate limit exceeded for quiz generation', { ip, materialId });
        return {
          success: false,
          error: `Demo rate limit reached. You can generate ${RATE_LIMIT_MAX} new quizzes per ${RATE_LIMIT_WINDOW_HOURS}h. Please try again later.`,
        };
      }

      logger.info('Generating quiz via OpenAI (demo, will be cached)', {
        materialId,
        ip,
        remaining: rateLimit.remaining,
      });

      const quiz = await generateQuiz(material.content_text);
      if (!quiz) {
        return {
          success: false,
          error: 'Failed to generate the quiz. Please try again later.',
        };
      }

      await cacheQuiz(materialId, quiz);
      return { success: true, quiz };
    }

    // Normal mode: always generate a fresh unique quiz
    logger.info('Generating quiz via OpenAI', { materialId });

    const quiz = await generateQuiz(material.content_text);
    if (!quiz) {
      return {
        success: false,
        error: 'Failed to generate the quiz. Please try again later.',
      };
    }

    return {
      success: true,
      quiz,
    };
  } catch (error) {
    logger.error('Failed to generate quiz', {
      error: error instanceof Error ? error.message : String(error),
      materialId,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return {
      success: false,
      error: 'Unexpected error while generating the quiz',
    };
  }
}

/**
 * Verifies answers against the displayed quiz and persists the attempt.
 */
export async function submitQuiz(
  materialId: string,
  answers: number[],
  quiz: Quiz
): Promise<QuizResult> {
  try {
    const materials = await getMaterials();
    const material = materials.find((m) => m.id === materialId);
    if (!material) {
      return {
        success: false,
        error: 'Material not found',
      };
    }

    const { estimateMaterialDuration } = await import('./utils');
    const materialDuration = estimateMaterialDuration(
      material.content_text,
      material.type
    );

    if (answers.length !== quiz.questions.length) {
      return {
        success: false,
        error: 'Invalid number of answers',
      };
    }

    let correctCount = 0;
    for (let i = 0; i < quiz.questions.length; i++) {
      if (answers[i] === quiz.questions[i].correct_answer) {
        correctCount++;
      }
    }

    const score = correctCount;
    const totalQuestions = quiz.questions.length;
    const passingScore = Math.floor(totalQuestions * PASSING_PERCENTAGE);
    const passed = score >= passingScore;

    const { error: attemptError } = await supabase.from('attempts').insert({
      material_id: materialId,
      score,
      passed,
    });

    if (attemptError) {
      logger.error('Failed to save quiz attempt', {
        error: attemptError.message,
        materialId,
        score,
        passed,
      });
      return {
        success: false,
        error: 'Failed to save result',
      };
    }

    let rewardMinutes = 0;
    if (passed) {
      // Check if reward already exists (avoid duplicates)
      const { data: existingReward } = await supabase
        .from('rewards')
        .select('id')
        .eq('material_id', materialId)
        .limit(1)
        .single();

      if (!existingReward) {
        let finalReward: number;
        if (material.reward_minutes && material.reward_minutes > 0) {
          finalReward = material.reward_minutes;
        } else {
          finalReward = calculateRewardMinutes(materialDuration);
        }

        const { error: rewardError } = await supabase.from('rewards').insert({
          material_id: materialId,
          minutes: finalReward,
          claimed: false,
        });

        if (rewardError) {
          logger.error('Failed to add reward', {
            error: rewardError.message,
            materialId,
            finalReward,
          });
          // Don't fail - reward is bonus, attempt already saved
        } else {
          rewardMinutes = finalReward;
        }
      }
    }

    return {
      success: true,
      score,
      passed,
      rewardMinutes: passed ? rewardMinutes : 0,
      passingScore,
      totalQuestions,
    };
  } catch (error) {
    logger.error('Quiz verification failed', {
      error: error instanceof Error ? error.message : String(error),
      materialId,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return {
      success: false,
      error: 'Unexpected error while verifying the quiz',
    };
  }
}

