const MAX_SLUG_LENGTH = 60

/**
 * Dropped so the length budget goes to the informative words. Without this a claim
 * starting "Fetch data with the shared..." spends half its slug on filler.
 */
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'can', 'do', 'for',
  'from', 'in', 'into', 'is', 'it', 'its', 'of', 'on', 'or', 'our', 'rather', 'than',
  'that', 'the', 'their', 'them', 'then', 'there', 'these', 'this', 'to', 'was', 'we',
  'were', 'when', 'which', 'with', 'you', 'your',
])

/**
 * Ids are derived from the claim so that diffs and supersession pointers stay legible,
 * then frozen — rewording a claim must never move what other entries point at.
 */
export function slugFromClaim(claim: string): string {
  const all = claim
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  // Keep stopwords only if dropping them would leave nothing to name the entry by.
  const meaningful = all.filter((w) => !STOPWORDS.has(w))
  const words = meaningful.length > 0 ? meaningful : all

  if (words.length === 0) return 'entry'

  const kept: string[] = []
  let length = 0
  for (const word of words) {
    const added = kept.length === 0 ? word.length : length + 1 + word.length
    if (kept.length > 0 && added > MAX_SLUG_LENGTH) break
    kept.push(word)
    length = added
  }

  // A single word longer than the cap still has to be truncated somewhere.
  if (kept.length === 1 && kept[0]!.length > MAX_SLUG_LENGTH) {
    return kept[0]!.slice(0, MAX_SLUG_LENGTH)
  }
  return kept.join('-')
}

/** Appends a numeric discriminator when the derived slug is already taken. */
export function uniqueId(claim: string, taken: ReadonlySet<string>): string {
  const base = slugFromClaim(claim)
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate)) return candidate
  }
}
