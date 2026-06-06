// Small helper functions shared across the app.

// Turn any thrown value into a plain text message.
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Pull the video id out of a YouTube link (handles a few link formats).
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

// Rough guess of how long a material takes, based on its word count.
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

// Turn material length into reward minutes. Longer materials give a bit less
// per minute, so the reward grows slower the longer the material is.
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
