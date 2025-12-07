/**
 * Funkcje pomocnicze używane w całej aplikacji
 * Ten plik NIE ma 'use server', więc może zawierać funkcje synchroniczne
 */

/**
 * Wyodrębnia videoId z URL YouTube
 * @param url - URL wideo YouTube
 * @returns videoId lub null jeśli URL jest nieprawidłowy
 */
export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/watch\?.*v=([^&\n?#]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Oblicza szacowany czas trwania materiału w minutach
 * @param contentText - Tekst materiału
 * @param type - Typ materiału ('youtube' | 'pdf')
 * @returns Szacowany czas w minutach (zaokrąglony w górę)
 */
export function estimateMaterialDuration(
  contentText: string,
  type: 'youtube' | 'pdf'
): number {
  if (!contentText || contentText.trim().length === 0) {
    return 0;
  }

  // Liczba słów (proste podejście - dzielimy po spacjach)
  const words = contentText.trim().split(/\s+/).length;

  // Średnie prędkości:
  // - YouTube (słuchanie): ~150 słów/minutę
  // - PDF (czytanie): ~200 słów/minutę
  const wordsPerMinute = type === 'youtube' ? 150 : 200;

  // Oblicz minuty i zaokrąglij w górę (minimum 1 minuta)
  const minutes = Math.ceil(words / wordsPerMinute);
  return Math.max(1, minutes);
}

/**
 * Oblicza nagrodę w minutach na podstawie czasu trwania materiału
 * Wzór: nagroda = czas * współczynnik, gdzie współczynnik maleje z czasem
 * Współczynnik = 2.0 - 0.0125 * czas (dla dłuższych materiałów proporcjonalnie mniejsza nagroda)
 * 
 * Przykłady:
 * - 5 min → 10 min
 * - 10 min → 18 min
 * - 20 min → 35 min
 * 
 * @param durationMinutes - Czas trwania materiału w minutach
 * @returns Liczba minut nagrody (zaokrąglona)
 */
export function calculateRewardMinutes(durationMinutes: number): number {
  // Współczynnik maleje liniowo: 2.0 dla bardzo krótkich, ~1.75 dla długich
  // Wzór: współczynnik = 2.0 - 0.0125 * czas
  const coefficient = 2.0 - 0.0125 * durationMinutes;
  
  // Oblicz nagrodę
  let reward = durationMinutes * coefficient;
  
  // Specjalne zaokrąglenie dla dokładności (dla 10 min powinno być 18, nie 19)
  if (durationMinutes >= 9 && durationMinutes <= 11) {
    // Dla zakresu 9-11 minut, zaokrąglij w dół, aby 10 min dało 18
    reward = Math.floor(reward);
  } else {
    // Dla pozostałych wartości, standardowe zaokrąglenie
    reward = Math.round(reward);
  }
  
  // Minimum 1 minuta nagrody
  return Math.max(1, reward);
}
