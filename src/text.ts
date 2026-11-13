/** `text` as a regular expression that matches it literally. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * `text` on one line: every run of whitespace, line breaks included, becomes one space, and the
 * ends are trimmed.
 */
export function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * `sentence` ending in one full stop, whether or not it ended in one already, for joining a
 * sentence from another layer to the next. A sentence ending in `..` keeps both: only one full
 * stop is dropped before one is added.
 */
export function singleFullStop(sentence: string): string {
  return `${withoutFullStop(sentence)}.`
}

/** `sentence` without the one full stop it may end in, for a template that adds its own. */
export function withoutFullStop(sentence: string): string {
  return sentence.replace(/\.$/, '')
}
