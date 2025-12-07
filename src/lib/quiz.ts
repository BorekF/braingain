'use server';

import { supabase } from './supabase';
import { generateQuiz, type Quiz } from './services';
import { getMaterials, type Material } from './materials';
import { calculateRewardMinutes } from './utils';
import { logger } from './logger';

const COOLDOWN_MINUTES = 10;
const COOLDOWN_SECONDS = COOLDOWN_MINUTES * 60;
const PASSING_SCORE = 9; // Minimum 9/10 do zaliczenia


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
}

/**
 * Sprawdza czy można rozwiązać quiz (cooldown po nieudanej próbie)
 */
export async function checkCooldown(materialId: string): Promise<CooldownStatus> {
  try {
    // Znajdź ostatnią nieudaną próbę (passed = false)
    const { data, error } = await supabase
      .from('attempts')
      .select('created_at')
      .eq('material_id', materialId)
      .eq('passed', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned (to jest OK)
      logger.error('Błąd sprawdzania cooldownu', {
        error: error.message,
        materialId,
      });
      // W przypadku błędu, pozwól na próbę (graceful degradation)
      return { allowed: true };
    }

    if (!data) {
      // Brak nieudanych prób - można rozwiązać
      return { allowed: true };
    }

    const lastAttemptTime = new Date(data.created_at).getTime();
    const now = Date.now();
    const elapsedSeconds = Math.floor((now - lastAttemptTime) / 1000);

    if (elapsedSeconds >= COOLDOWN_SECONDS) {
      // Cooldown minął
      return { allowed: true };
    }

    // Wciąż w cooldownie
    const remainingSeconds = COOLDOWN_SECONDS - elapsedSeconds;
    return {
      allowed: false,
      remainingSeconds,
      lastAttempt: data.created_at,
    };
  } catch (error) {
    logger.error('Błąd sprawdzania cooldownu', {
      error: error instanceof Error ? error.message : String(error),
      materialId,
    });
    // W przypadku błędu, pozwól na próbę
    return { allowed: true };
  }
}

/**
 * Sprawdza czy materiał został już zaliczony
 */
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
      logger.error('Błąd sprawdzania zaliczenia materiału', {
        error: error.message,
        materialId,
      });
      return false;
    }

    return !!data;
  } catch (error) {
    logger.error('Błąd sprawdzania zaliczenia materiału', {
      error: error instanceof Error ? error.message : String(error),
      materialId,
    });
    return false;
  }
}

/**
 * Generuje quiz dla materiału (sprawdza cooldown, generuje przez OpenAI)
 */
export async function startQuiz(materialId: string): Promise<{
  success: boolean;
  quiz?: Quiz;
  error?: string;
  cooldown?: CooldownStatus;
}> {
  try {
    // Sprawdź cooldown
    const cooldown = await checkCooldown(materialId);
    if (!cooldown.allowed) {
      return {
        success: false,
        error: 'Musisz poczekać przed kolejną próbą',
        cooldown,
      };
    }

    // Sprawdź czy materiał istnieje
    const materials = await getMaterials();
    const material = materials.find((m) => m.id === materialId);
    if (!material) {
      return {
        success: false,
        error: 'Materiał nie został znaleziony',
      };
    }

    // Generuj quiz z treści materiału
    const quiz = await generateQuiz(material.content_text);
    if (!quiz) {
      return {
        success: false,
        error: 'Nie udało się wygenerować quizu. Spróbuj ponownie później.',
      };
    }

    return {
      success: true,
      quiz,
    };
  } catch (error) {
    logger.error('Błąd generowania quizu', {
      error: error instanceof Error ? error.message : String(error),
      materialId,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return {
      success: false,
      error: 'Nieoczekiwany błąd podczas generowania quizu',
    };
  }
}

/**
 * Weryfikuje odpowiedzi i zapisuje wynik
 */
export async function submitQuiz(
  materialId: string,
  answers: number[], // Tablica indeksów wybranych odpowiedzi (0-3 dla każdego pytania)
  quiz: Quiz // Quiz, który był wyświetlony użytkownikowi (ten sam, na który odpowiadał)
): Promise<QuizResult> {
  try {
    // Sprawdź czy materiał istnieje
    const materials = await getMaterials();
    const material = materials.find((m) => m.id === materialId);
    if (!material) {
      return {
        success: false,
        error: 'Materiał nie został znaleziony',
      };
    }

    // Oblicz czas trwania materiału (potrzebne tylko jeśli reward_minutes nie jest ustawione)
    const { estimateMaterialDuration } = await import('./utils');
    const materialDuration = estimateMaterialDuration(
      material.content_text,
      material.type
    );

    // Sprawdź czy liczba odpowiedzi się zgadza
    if (answers.length !== quiz.pytania.length) {
      return {
        success: false,
        error: 'Nieprawidłowa liczba odpowiedzi',
      };
    }

    // Weryfikuj odpowiedzi używając przekazanego quizu
    let correctCount = 0;
    for (let i = 0; i < quiz.pytania.length; i++) {
      if (answers[i] === quiz.pytania[i].poprawna_odpowiedz) {
        correctCount++;
      }
    }

    const score = correctCount;
    const passed = score >= PASSING_SCORE;

    // Zapisz próbę do bazy
    const { error: attemptError } = await supabase.from('attempts').insert({
      material_id: materialId,
      score,
      passed,
    });

    if (attemptError) {
      logger.error('Błąd zapisu próby quizu', {
        error: attemptError.message,
        materialId,
        score,
        passed,
      });
      return {
        success: false,
        error: 'Nie udało się zapisać wyniku',
      };
    }

    // Jeśli zaliczono (>= 9/10), dodaj nagrodę
    let rewardMinutes = 0;
    if (passed) {
      // Sprawdź czy nagroda już istnieje (aby uniknąć duplikatów)
      const { data: existingReward } = await supabase
        .from('rewards')
        .select('id')
        .eq('material_id', materialId)
        .limit(1)
        .single();

      if (!existingReward) {
        // Użyj reward_minutes z materiału, jeśli jest ustawione, w przeciwnym razie oblicz
        let finalReward: number;
        if (material.reward_minutes && material.reward_minutes > 0) {
          finalReward = material.reward_minutes;
        } else {
          // Fallback: oblicz nagrodę na podstawie czasu trwania materiału
          finalReward = calculateRewardMinutes(materialDuration);
        }
        
        // Dodaj nagrodę tylko jeśli jeszcze nie istnieje
        const { error: rewardError } = await supabase.from('rewards').insert({
          material_id: materialId,
          minutes: finalReward,
          claimed: false,
        });

        if (rewardError) {
          logger.error('Błąd dodawania nagrody', {
            error: rewardError.message,
            materialId,
            finalReward,
          });
          // Nie zwracamy błędu - nagroda to bonus, próba została zapisana
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
    };
  } catch (error) {
    logger.error('Błąd weryfikacji quizu', {
      error: error instanceof Error ? error.message : String(error),
      materialId,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return {
      success: false,
      error: 'Nieoczekiwany błąd podczas weryfikacji quizu',
    };
  }
}

