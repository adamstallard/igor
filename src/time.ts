/**
 * A timestamp as the instant it names, in milliseconds, for comparing two moments. An unparsable
 * timestamp is the earliest instant there is, `-Infinity`, so it is never the later of two.
 *
 * Compare timestamps as instants, never as strings. GitHub returns `...T00:00:00Z` while anything
 * generated here carries milliseconds, and `.000Z` sorts before `Z`, so comparing the strings
 * would call an item fresh purely because of how its timestamp was spelled.
 *
 * Use this only where an unparsable timestamp should count as the earliest. Several comparisons
 * elsewhere keep an undatable comment, stop or reset on purpose, and this would drop it.
 */
export function instant(iso: string): number {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? -Infinity : t
}
