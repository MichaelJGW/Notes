// The three brand tones; things that need a stable color (notebooks, group depth) cycle through them.
export const TONES = ['orange', 'aubergine', 'teal'];

export const tone = (n) => `var(--${TONES[((n % 3) + 3) % 3]})`;
export const softTone = (n) => `var(--${TONES[((n % 3) + 3) % 3]}-soft)`;
