/**
 * Recognizing the two things a person says to a working Igor: stop, and carry on.
 *
 * Surface-agnostic on purpose. A GitHub comment, a Discord reply and a Linear comment are all
 * just text written by a person, and the words they use do not change with the venue — so the
 * recognition lives here rather than in whichever adapter needed it first.
 */

/** Deliberate enough not to fire on prose, loose enough that nobody has to learn a syntax. */
// Not `stop-gap`, which opens a sentence about something else entirely. The word boundary
// alone matches before a hyphen, and this rule gates unclaimed items as well as firing inside a
// claim the Igor already holds. The word may sit in emphasis, `**Stop**`, `**Stop.**` or
// `_stop_`, and the match runs past the closing markers so the names after it are read from the
// right place. Strikethrough is a word taken back, never a stop. A code span counts only alone on
// its line or before mentions, since "`stop()` is called twice" names a function rather than
// asking for anything.
const verb = (words: string): RegExp =>
  new RegExp(
    `^(?:[*_]{0,3}(?:${words})(?:\\b(?!-)(?![*_]*\\w)|(?=_+(?:\\W|$)))(?:[.!]?[*_]+)?|\`(?:${words})\`(?=[^\\S\\n]*(?:@|\\n|$)))`,
    'i',
  )
const STOP = verb('stop')
const GO_AHEAD = verb('go ahead|go on|resume|carry on|continue|proceed|unblocked|all yours')

function addressed(text: string, identity: string, verb: RegExp): boolean {
  // A GitHub App's bot is `<slug>[bot]` to REST and `<slug>` to GraphQL and to a person
  // typing a mention, so the name matches with or without the suffix. The lookbehind refuses a
  // name that ends another one (`@code-reviewer`, `bob@reviewer`, `@org/reviewer`); the
  // lookahead ends the name where `\b` cannot, after the `]`.
  const named = identity
    .replace(/^@/, '')
    .replace(/\[bot\]$/i, '')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (named === '') return false
  // Further mentions may sit between the name and the verb, joined by spaces, commas, `and`, `or`,
  // `and/or`, `&`, `/` or `+`, so `@a @b stop`, `@a and @b stop`, `@a or @b stop` and `@a/@b stop`
  // are addressed to each. Any mention may sit in markup or brackets (`` `@a` ``, `**@a**`,
  // `_@a_`, `(@a)`), and an en dash separates as an em dash does (`@a – stop`). A line break
  // joins two mentions only after a separator (`@a,` then `@b stop` on the next line), so a
  // paragraph that opens "@b stop" does not reach back to a name above it. A name straight after
  // `/` counts only as a mention of its own (`@a/@b`), never as the end of a path or a team
  // (`@org/b`, `github.com/b`).
  // In `others` a name never ends on `_`, so trailing underscores are always emphasis and the
  // match stays linear rather than trying every split of a run of them between name and markup.
  const closers = `[)\\]*_\`~"']*`
  const others = `(?:(?:[^\\S\\n]*[,:&+/–—-][\\s,:&+/–—-]*|[^\\S\\n]+)(?:(?:and|or)(?:/(?:and|or))?\\s+)?[(\\[*_\`~"']*@[\\w.-]*[A-Za-z0-9.-](?:\\[bot\\])?${closers})*`
  const mention = new RegExp(
    `(?:(?<![\\w@./-])@?|(?<=/)@|(?<=(?:^|[^\\w@./-])_+)@)${named}(?:\\[bot\\])?(?!_*[A-Za-z0-9])${closers}${others}[\\s,:–—-]+`,
    'gi',
  )
  // Every mention of the name is tried, so one in passing earlier in the comment does not hide a
  // later "@name stop". A mention on a quoted line (`> `) is somebody else's words, not this one.
  for (const found of text.matchAll(mention)) {
    const lineStart = text.lastIndexOf('\n', found.index) + 1
    if (/^\s*>/.test(text.slice(lineStart, found.index))) continue
    if (verb.test(text.slice(found.index + found[0].length).trim())) return true
  }
  return false
}

/**
 * Which mentioned names are Igors, as the tracker resolved them, keyed by the name as `bareName`
 * spells it. A name missing here could not be resolved. Without a record at all, every name counts
 * as naming an Igor.
 */
export type Accounts = Readonly<Record<string, 'igor' | 'other'>>

/**
 * A stop is unconditional and open to anyone, so recognition cannot depend on who wrote it.
 *
 * It must still be deliberate. A bare opening `stop` counts, for every Igor on the item; so does
 * a stop addressed to this Igor by name. A stop that names other Igors does not stop this one
 * (decided by Adam, 2026-10-11): "stop @igor-backend" is meant for that Igor, and stopping the
 * frontend Igor too would take back a hand-over nobody asked to take back, though the same
 * comment still stops this Igor where it goes on to address it ("@igor-frontend stop too"). A
 * stop addressed to several Igors, "@igor-backend @igor-frontend stop", stops each. A stop
 * addressed to a person stops no Igor: "@alice stop doing that" is one person talking to another
 * on an item an Igor happens to hold, and treating it as a stop would let a conversation between
 * two other people halt the work.
 *
 * A name after the opening `stop` that is no Igor counts as no name (Adam, 2026-10-11), so "Stop —
 * @alice is taking over" stops every Igor. A name `accounts` could not resolve counts as no name
 * too, since stopping too many is the safer error.
 */
export function isStop(body: string, identity: string, accounts?: Accounts): boolean {
  const text = body.trim()
  if (STOP.test(text)) {
    // A bare stop stops every Igor on the item; one that names Igors right after the word stops
    // only those, so `stop @igor-backend` leaves the frontend Igor working.
    const { list } = namesAfter(text, STOP)
    const igors = list.filter((name) => isIgor(name, identity, accounts, 'unresolved-is-not'))
    if (meantFor(igors, identity)) return true
  }
  // A comment that opens by stopping another Igor can still address this one further on.
  return addressed(text, identity, STOP)
}

/**
 * The counterpart, which exists so a stop needs no second verb to undo it. Someone says the
 * work may resume and the cooldown is over; nothing else about the protocol changes.
 *
 * Deliberately narrow: "we should go ahead with the redesign" is a remark about the work, not
 * permission to resume, so only an opening phrase or one addressed to this Igor counts. Its names
 * are read by the stop's parser (decided by Adam, 2026-10-11): a bare go-ahead lifts a stop for
 * every Igor on the item, and "go ahead @igor-backend" lifts it only for the Igors it names, so a
 * person who lets one Igor resume does not resume another.
 *
 * Where the parser could read too many names or too few, a go-ahead errs the other way from a
 * stop, since lifting a stop by mistake is the costlier error (Adam, 2026-10-11). Mentions later
 * on the opening line count where no Igor's name follows the phrase, so "go ahead and pick it back
 * up, @igor-backend" and "carry on, @alice approved it for @igor-backend" are for the backend Igor
 * alone. Whichever names it reads, a run of them that goes straight on into a word loses its last,
 * so "go ahead @igor-backend, @igor-frontend keep waiting" is for the backend Igor alone. A name
 * that is no Igor counts as no name, so "carry on, @alice approved it" lifts the stop for every
 * Igor; a name `accounts` could not resolve still counts. Whether it names an Igor is read before
 * the trim, so a trim that drops the only Igor leaves it for nobody.
 */
export function isGoAhead(body: string, identity: string, accounts?: Accounts): boolean {
  const text = body.trim()
  if (GO_AHEAD.test(text)) {
    const { list, endsOnWord, later, laterEndsOnWord } = namesAfter(text, GO_AHEAD)
    const igor = (name: string): boolean => isIgor(name, identity, accounts, 'unresolved-is-igor')
    const usesList = list.some(igor)
    const named = usesList ? list : later
    const runsOn = usesList ? endsOnWord : laterEndsOnWord
    const kept = named.length > 1 && runsOn ? named.slice(0, -1) : named
    if (named.some(igor) ? kept.filter(igor).some((name) => sameAccountName(name, identity)) : true) return true
  }
  // A comment that opens by letting another Igor resume can still address this one further on.
  return addressed(text, identity, GO_AHEAD)
}

/** A bare opening, naming no Igor, is meant for every Igor on the item; one that names Igors, for those. */
function meantFor(named: readonly string[], identity: string): boolean {
  return named.length === 0 || named.some((name) => sameAccountName(name, identity))
}

/** Whether a name read after an opening verb names an Igor. This Igor always is one. */
function isIgor(
  name: string,
  identity: string,
  accounts: Accounts | undefined,
  unresolved: 'unresolved-is-igor' | 'unresolved-is-not',
): boolean {
  if (accounts === undefined || sameAccountName(name, identity)) return true
  const kind = accounts[bareName(name)]
  return kind === undefined ? unresolved === 'unresolved-is-igor' : kind === 'igor'
}

/**
 * What a comment opening with `verb` names: `list`, the accounts named straight after the verb;
 * `endsOnWord`, whether that list runs straight on into a word; `later`, the mentions further on
 * the line the list ends on, or on the opening line where the list is empty, and never past a line
 * break the list's last separator crossed; and `laterEndsOnWord`, whether the last of those runs
 * straight on into a word.
 *
 * `list` reads `stop @a`, `stop @a, @b`, `stop @a and @b`, `stop @a, @b, and @c`, `stop @a or @b`,
 * `stop @a and/or @b`, `stop @a & @b`, `stop @a/@b`, `stop @a + @b`, and the same after a go-ahead
 * phrase. A comma may stand alone or come before a joiner (`and`, `or`, `and/or`, `&`, `/`, `+`).
 * It is empty for a bare opening, and for one whose first word after the verb is not a mention.
 *
 * A mention may sit in markup or brackets (`` `@a` ``, `**@a**`, `_@a_`, `(@a)`) and take a
 * possessive with either apostrophe, anywhere in the list: `stop @a's and @b’s work` names both.
 * A login ends on a letter or digit, so the period ending a sentence, `stop @a.`, is not part of
 * the name; `_` and `.` inside one are, as Enterprise logins carry them. The list ends at the
 * first thing that is neither a mention nor a separator between two.
 *
 * A line break ends the list unless a separator comes before it: `stop` on a line of its own,
 * followed by a paragraph addressing a person, is a bare stop, and the same holds for a go-ahead.
 * A separator carries the list over one line break, never over a blank line, so a paragraph that
 * opens with a mention is never part of the list above it.
 */
function namesAfter(
  text: string,
  verb: RegExp,
): { list: string[]; endsOnWord: boolean; later: string[]; laterEndsOnWord: boolean } {
  const mention = /[(\[*_`~"']*@([A-Za-z0-9](?:[\w.-]*[A-Za-z0-9])?(?:\[bot\])?)(?:['’]s)?[)\]*_`~"']*(?:['’]s)?/iy
  const separator = /[^\S\n]*(?:,[^\S\n]*(?:\n[^\S\n]*)?)?(?:(?:&|\+|\/|\band\b|\bor\b)(?:\/(?:and|or)\b)?[^\S\n]*(?:\n[^\S\n]*)?)?/iy
  const rest = text.slice(verb.exec(text)?.[0].length ?? 0)
  const list: string[] = []
  let at = /^[^\S\n]*(?:[:,—–-]+[^\S\n]*(?:\n[^\S\n]*)?)?/.exec(rest)![0].length
  let end = at
  for (;;) {
    mention.lastIndex = at
    const found = mention.exec(rest)
    if (found === null) break
    list.push(found[1]!)
    end = mention.lastIndex
    separator.lastIndex = end
    separator.exec(rest)
    at = separator.lastIndex
  }
  const endsOnWord = list.length > 0 && /^[^\S\n]+[A-Za-z]/.test(rest.slice(end))
  const crossed = rest.slice(list.length > 0 ? end : 0, at).includes('\n')
  const line = crossed ? '' : rest.slice(at).split('\n', 1)[0]!
  const mentions = [...line.matchAll(MENTION)]
  const later = mentions.map((m) => m[1]!)
  const last = mentions[mentions.length - 1]
  const laterEndsOnWord =
    last !== undefined && RUNS_ON.test(line.slice(last.index + last[0].length))
  return { list, endsOnWord, later, laterEndsOnWord }
}

/** What follows a mention that runs straight on into a word, past a possessive or closing markup. */
const RUNS_ON = /^(?:['’]s)?[)\]*_`~"']*(?:['’]s)?[^\S\n]+[A-Za-z]/

/**
 * A mention anywhere in text: not the end of another name, a path or a team, though it may sit in
 * `_` emphasis or follow the `/` that joins two mentions.
 */
const MENTION = /(?:(?<=(?:^|[^\w@./-])_*)|(?<=\/))@([A-Za-z0-9](?:[\w.-]*[A-Za-z0-9])?(?:\[bot\])?)/gi

/**
 * The names a tracker should resolve for `isStop` and `isGoAhead` to read `body`: exactly the
 * names `namesAfter` reads after its opening stop or go-ahead, and none otherwise, as `bareName`
 * spells them.
 */
export function namesToResolve(body: string): string[] {
  const text = body.trim()
  const verb = STOP.test(text) ? STOP : GO_AHEAD.test(text) ? GO_AHEAD : undefined
  if (verb === undefined) return []
  const { list, later } = namesAfter(text, verb)
  return [...new Set([...list, ...later].map(bareName))]
}

/** A login as an account record keys it: lower case, without `@` or the `[bot]` a bot carries. */
export function bareName(name: string): string {
  return name.replace(/^@/, '').replace(/\[bot\]$/i, '').toLowerCase()
}

/** Whether a mentioned name is this identity, spelled with or without the `[bot]` a bot carries. */
function sameAccountName(name: string, identity: string): boolean {
  return bareName(name) === bareName(identity) && bareName(identity) !== ''
}
