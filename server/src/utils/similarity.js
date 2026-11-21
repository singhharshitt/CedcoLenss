/**
 * Helpers for near-duplicate detection.
 *
 * looseKey(): lower-case, Unicode NFC, punctuation removed, whitespace collapsed.
 * Emoji and other symbols are KEPT on purpose: "Amazing speed" and "Amazing speed 🙄"
 * mean opposite things, so they must never be merged.
 */
export function looseKey(text) {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/\p{P}+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * Levenshtein distance, giving up early once it exceeds `maxDistance`
 * (returns maxDistance + 1 in that case). Works on code points, so emoji count as one.
 */
export function boundedLevenshtein(a, b, maxDistance = Infinity) {
  const s = [...a];
  const t = [...b];
  if (Math.abs(s.length - t.length) > maxDistance) return maxDistance + 1;
  let prev = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    prev = curr;
  }
  return prev[t.length];
}

/** Similarity in [0, 1] (1 = identical), or 0 when below `minRatio` (computed with an early exit). */
export function similarityRatio(a, b, minRatio = 0) {
  const longest = Math.max([...a].length, [...b].length);
  if (longest === 0) return 1;
  const maxDistance = Math.floor(longest * (1 - minRatio));
  const distance = boundedLevenshtein(a, b, maxDistance);
  if (distance > maxDistance) return 0;
  return 1 - distance / longest;
}
