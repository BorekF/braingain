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

export function estimateMaterialDuration(
  contentText: string,
  type: 'youtube' | 'pdf'
): number {
  if (!contentText || contentText.trim().length === 0) {
    return 0;
  }

  const words = contentText.trim().split(/\s+/).length;
  const wordsPerMinute = type === 'youtube' ? 150 : 200;
  const minutes = Math.ceil(words / wordsPerMinute);
  return Math.max(1, minutes);
}

/**
 * Reward minutes scale with duration but with a decreasing coefficient
 * so longer materials give proportionally fewer bonus minutes.
 * coefficient = 2.0 - 0.0125 * duration  (e.g. 5 min -> 10, 10 min -> 18, 20 min -> 35)
 */
export function calculateRewardMinutes(durationMinutes: number): number {
  const coefficient = 2.0 - 0.0125 * durationMinutes;
  let reward = durationMinutes * coefficient;

  if (durationMinutes >= 9 && durationMinutes <= 11) {
    reward = Math.floor(reward);
  } else {
    reward = Math.round(reward);
  }

  return Math.max(1, reward);
}
