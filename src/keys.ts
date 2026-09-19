/**
 * One rule for every configuration parser here: a key nobody reads is refused by name.
 *
 * A key a parser does not know is a key it drops in silence, leaving a file that reads as
 * configured and behaves as though it were not: a misspelt `capacity_estimate` reports
 * NO_CAPACITY_FIGURE over a figure that is on the page, and a misspelt `seats` enforces no
 * budget at all. The refusal names the offending key and the accepted ones, because the fix is
 * a spelling and the reader is looking at the file.
 */
export function keyCheck(Failure: new (message: string) => Error) {
  /**
   * @param subject how the file names what is being read — `seat "adam"`, `config`, a path
   * @param kind the accepted keys' collective noun, with its article: `a seat key`
   */
  return (
    mapping: Record<string, unknown>,
    accepted: readonly string[],
    subject: string,
    kind: string,
  ): void => {
    for (const key of Object.keys(mapping)) {
      if (!accepted.includes(key)) {
        throw new Failure(`${subject} names "${key}", which is not ${kind}: ${accepted.join(', ')}`)
      }
    }
  }
}
