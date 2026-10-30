/**
 * Recognizing the two things a person says to a working Igor: stop, and carry on.
 *
 * Surface-agnostic on purpose. A GitHub comment, a Discord reply and a Linear comment are all
 * just text written by a person, and the words they use do not change with the venue — so the
 * recognition lives here rather than in whichever adapter needed it first.
 */

import { escapeRegExp } from './text.js'

// Fragments of the mention grammar, each shared by more than one pattern below. The grammar before
// the verb and the one after it differ on purpose, so only what they share is here: `:` and dashes
// join names before the verb but end the list after it, a name ends on `.` or `-` before the verb
// but on a letter or digit after it, and each crosses line breaks by its own rule.

/** What continues a name, a path or a team: one of these before `@` makes it no mention. */
const NAME_CHARS = '\\w@./-'
/** A space or tab: whitespace that is not a line break. */
const SPACE = '[^\\S\\n]'
/** The `[bot]` a GitHub App's bot carries to REST, optional since GraphQL and people omit it. */
const BOT = '(?:\\[bot\\])?'
/** Markup or a bracket that may open around a mention: `` `@a` ``, `**@a**`, `_@a_`, `(@a)`. */
const OPENERS = `[(\\[*_\`~"']*`
/** The markup or bracket that closes one. */
const CLOSERS = `[)\\]*_\`~"']*`
/** A possessive, with either apostrophe. */
const POSSESSIVE = `(?:['’]s)?`
/** A login after the verb, ending on a letter or digit so a sentence's full stop stays out. */
const LOGIN = '[A-Za-z0-9](?:[\\w.-]*[A-Za-z0-9])?'
/** Spaces, then a word: a mention that runs straight on into one. */
const INTO_WORD = `${SPACE}+[A-Za-z]`

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
    `^(?:[*_]{0,3}(?:${words})(?:\\b(?!-)(?![*_]*\\w)|(?=_+(?:\\W|$)))(?:[.!]?[*_]+)?|\`(?:${words})\`(?=${SPACE}*(?:@|\\n|$)))`,
    'i',
  )
const STOP = verb('stop')
const GO_AHEAD = verb('go ahead|go on|resume|carry on|continue|proceed|unblocked|all yours')

function addressed(text: string, identity: string, verb: RegExp): boolean {
  const mention = mentionOf(identity)
  if (mention === undefined) return false
  // Every mention of the name is tried, so one in passing earlier in the comment does not hide a
  // later "@name stop". A mention after a line's opening `>` quotes somebody else's words, so it
  // is skipped rather than read as a request.
  // Each line's `>` is looked for once, at the first mention on that line, and reused for the
  // other mentions on it. Searching back to the line's start from every mention instead rescans
  // a long line once per mention, which makes a comment of thousands of mentions on one line
  // take seconds.
  let nextBreak = text.indexOf('\n')
  let quoteMark = quoteMarkAt(text, 0)
  for (const found of text.matchAll(mention)) {
    if (nextBreak !== -1 && nextBreak <= found.index) {
      const lineStart = text.lastIndexOf('\n', found.index) + 1
      nextBreak = text.indexOf('\n', lineStart)
      quoteMark = quoteMarkAt(text, lineStart)
    }
    if (quoteMark !== -1 && quoteMark < found.index) continue
    if (verb.test(text.slice(found.index + found[0].length).trim())) return true
  }
  return false
}

/**
 * A mention of `identity` and any further mentions up to where the verb would start, or
 * `undefined` for an identity whose `bareName` is empty, such as `@` or `[bot]`.
 */
function mentionOf(identity: string): RegExp | undefined {
  // A GitHub App's bot is `<slug>[bot]` to REST and `<slug>` to GraphQL and to a person
  // typing a mention, so the name matches with or without the suffix. The lookbehind refuses a
  // name that ends another one (`@code-reviewer`, `bob@reviewer`, `@org/reviewer`); the
  // lookahead ends the name where `\b` cannot, after the `]`.
  const named = escapeRegExp(bareName(identity))
  if (named === '') return undefined
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
  const others = `(?:(?:${SPACE}*[,:&+/–—-][\\s,:&+/–—-]*|${SPACE}+)(?:(?:and|or)(?:/(?:and|or))?\\s+)?${OPENERS}@[\\w.-]*[A-Za-z0-9.-]${BOT}${CLOSERS})*`
  return new RegExp(
    `(?:(?<![${NAME_CHARS}])@?|(?<=/)@|(?<=(?:^|[^${NAME_CHARS}])_+)@)${named}${BOT}(?!_*[A-Za-z0-9])${CLOSERS}${others}[\\s,:–—-]+`,
    'gi',
  )
}

/**
 * Where the `>` quoting the line at `lineStart` sits, or -1 if the line is not quoted. Only
 * whitespace other than a line break may come before the `>`. `QUOTE_MARK` must stay sticky, so
 * it matches at `lineStart` and nowhere later.
 */
function quoteMarkAt(text: string, lineStart: number): number {
  QUOTE_MARK.lastIndex = lineStart
  return QUOTE_MARK.test(text) ? QUOTE_MARK.lastIndex - 1 : -1
}
const QUOTE_MARK = new RegExp(`${SPACE}*>`, 'y')

/**
 * Which mentioned names count as Igors, as the tracker resolved them, keyed by the name as
 * `bareName` spells it. A name missing here could not be resolved; a comment that mentions nobody
 * has an empty record.
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
export function isStop(body: string, identity: string, accounts: Accounts): boolean {
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
export function isGoAhead(body: string, identity: string, accounts: Accounts): boolean {
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
  accounts: Accounts,
  unresolved: 'unresolved-is-igor' | 'unresolved-is-not',
): boolean {
  if (sameAccountName(name, identity)) return true
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
  const rest = text.slice(verb.exec(text)?.[0].length ?? 0)
  const list: string[] = []
  let at = LIST_START.exec(rest)![0].length
  let end = at
  for (;;) {
    LIST_MENTION.lastIndex = at
    const found = LIST_MENTION.exec(rest)
    if (found === null) break
    list.push(found[1]!)
    end = LIST_MENTION.lastIndex
    LIST_SEPARATOR.lastIndex = end
    LIST_SEPARATOR.exec(rest)
    at = LIST_SEPARATOR.lastIndex
  }
  const endsOnWord = list.length > 0 && ENDS_ON_WORD.test(rest.slice(end))
  const crossed = rest.slice(list.length > 0 ? end : 0, at).includes('\n')
  const line = crossed ? '' : rest.slice(at).split('\n', 1)[0]!
  const mentions = [...line.matchAll(MENTION)]
  const later = mentions.map((m) => m[1]!)
  const last = mentions[mentions.length - 1]
  const laterEndsOnWord =
    last !== undefined && RUNS_ON.test(line.slice(last.index + last[0].length))
  return { list, endsOnWord, later, laterEndsOnWord }
}

/**
 * What may come between the verb and the first name: spaces, then optionally a colon, comma or
 * dash followed by spaces and at most one line break. It may match nothing.
 */
const LIST_START = new RegExp(String.raw`^${SPACE}*(?:[:,—–-]+${SPACE}*(?:\n${SPACE}*)?)?`)

/**
 * One name in the list after the verb. It is sticky, like `LIST_SEPARATOR`, and one instance of
 * each serves every call: that is safe only because `namesAfter` sets `lastIndex` before each
 * `exec`.
 */
const LIST_MENTION = new RegExp(`${OPENERS}@(${LOGIN}${BOT})${POSSESSIVE}${CLOSERS}${POSSESSIVE}`, 'iy')

/** What joins two names in that list. */
const LIST_SEPARATOR = new RegExp(
  String.raw`${SPACE}*(?:,${SPACE}*(?:\n${SPACE}*)?)?(?:(?:&|\+|\/|\band\b|\bor\b)(?:\/(?:and|or)\b)?${SPACE}*(?:\n${SPACE}*)?)?`,
  'iy',
)

/** What follows the list when it runs straight on into a word. */
const ENDS_ON_WORD = new RegExp(`^${INTO_WORD}`)

/** What follows a mention that runs straight on into a word, past a possessive or closing markup. */
const RUNS_ON = new RegExp(`^${POSSESSIVE}${CLOSERS}${POSSESSIVE}${INTO_WORD}`)

/**
 * A mention anywhere in text: not the end of another name, a path or a team, though it may sit in
 * `_` emphasis or follow the `/` that joins two mentions.
 */
const MENTION = new RegExp(String.raw`(?:(?<=(?:^|[^${NAME_CHARS}])_*)|(?<=\/))@(${LOGIN}${BOT})`, 'gi')

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
  return name.replace(LEADING_AT, '').replace(TRAILING_BOT, '').toLowerCase()
}

const LEADING_AT = /^@/
const TRAILING_BOT = /\[bot\]$/i

/**
 * Every pattern this module matches with, by name, with the mention of `identity` built as
 * `isStop` and `isGoAhead` build it (none when its `bareName` is empty). A test checks that each
 * runs in linear time, and fails on a pattern the module runs that is missing here, provided its
 * sample comments reach that pattern.
 */
export function grammarPatterns(identity: string): Record<string, RegExp> {
  const mention = mentionOf(identity)
  return {
    STOP,
    GO_AHEAD,
    ...(mention === undefined ? {} : { mentionOf: mention }),
    QUOTE_MARK,
    LIST_START,
    LIST_MENTION,
    LIST_SEPARATOR,
    ENDS_ON_WORD,
    RUNS_ON,
    MENTION,
    LEADING_AT,
    TRAILING_BOT,
  }
}

/** Whether a mentioned name is this identity, spelled with or without the `[bot]` a bot carries. */
function sameAccountName(name: string, identity: string): boolean {
  return bareName(name) === bareName(identity) && bareName(identity) !== ''
}
