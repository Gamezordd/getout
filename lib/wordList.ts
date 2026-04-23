const WORDS_A = ["jolly", "brave", "swift", "grand", "light", "sharp", "warm", "vivid", "calm"];
const WORDS_B = ["moon", "star", "pine", "stone", "wave", "gale", "dawn", "peak", "lake"];
const WORDS_C = ["spark", "grove", "crest", "bloom", "drift", "quest", "trail", "forge", "vale"];

export const ALL_SLUGS: string[] = [];
for (const a of WORDS_A) {
  for (const b of WORDS_B) {
    for (const c of WORDS_C) {
      ALL_SLUGS.push(`${a}-${b}-${c}`);
    }
  }
}

export const isValidSlug = (s: string): boolean =>
  /^[a-z]+-[a-z]+-[a-z]+$/.test(s) && ALL_SLUGS.includes(s);

export const generateRandomSlug = (): string => {
  const a = WORDS_A[Math.floor(Math.random() * WORDS_A.length)];
  const b = WORDS_B[Math.floor(Math.random() * WORDS_B.length)];
  const c = WORDS_C[Math.floor(Math.random() * WORDS_C.length)];
  return `${a}-${b}-${c}`;
};
