const BLOCKED = [
  "idiot",
  "stupid",
  "noob",
  "trash",
  "hack",
  "hacker",
  "cheat",
  "scam",
  "madarchod",
  "bhosdi",
  "gandu",
  "chutiya",
  "bc",
  "mc",
];

/** Lightweight client-side profanity filter (the DB re-filters on insert). */
export function filterProfanity(input: string): string {
  const normalized = input.replace(/\s+/g, " ").trim();
  return BLOCKED.reduce((text, word) => {
    const pattern = new RegExp(`\\b${word}\\b`, "gi");
    return text.replace(pattern, "*".repeat(word.length));
  }, normalized);
}

export function isProfane(input: string): boolean {
  return filterProfanity(input) !== input.replace(/\s+/g, " ").trim();
}
