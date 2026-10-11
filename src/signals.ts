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
  // `(@a)`), and an en dash separates as an em dash does (`@a – stop`). A line break joins two
  // mentions only after a separator (`@a,` then `@b stop` on the next line), so a paragraph that
  // opens "@b stop" does not reach back to a name above it. A name straight after `/`
  // counts only as a mention of its own (`@a/@b`), never as the end of a path or a team
  // (`@org/b`, `github.com/b`).
  const closers = `[)\\]*\`~"']*`
  const others = `(?:(?:[^\\S\\n]*[,:&+/–—-][\\s,:&+/–—-]*|[^\\S\\n]+)(?:(?:and|or)(?:/(?:and|or))?\\s+)?[(\\[*\`~"']*@[\\w.-]+(?:\\[bot\\])?${closers})*`
  const mention = new RegExp(
    `(?:(?<![\\w@./-])@?|(?<=/)@)${named}(?:\\[bot\\])?(?!\\w)${closers}${others}[\\s,:–—-]+`,
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
 * A stop is unconditional and open to anyone, so recognition cannot depend on who wrote it.
 *
 * It must still be deliberate. A bare opening `stop` counts, for every Igor on the item; so does
 * a stop addressed to this Igor by name. A stop that names other accounts does not stop this one
 * (decided by Adam, 2026-10-11): "stop @igor-backend" is meant for that Igor, and stopping the
 * frontend Igor too would take back a hand-over nobody asked to take back, though the same
 * comment still stops this Igor where it goes on to address it ("@igor-frontend stop too"). A
 * stop addressed to several Igors, "@igor-backend @igor-frontend stop", stops each. A stop
 * addressed to a person stops no Igor: "@alice stop doing that" is one person talking to another
 * on an item an Igor happens to hold, and treating it as a stop would let a conversation between
 * two other people halt the work.
 */
export function isStop(body: string, identity: string): boolean {
  const text = body.trim()
  if (STOP.test(text)) {
    // A bare stop stops every Igor on the item; one that names accounts right after the word
    // stops only those, so `stop @igor-backend` leaves the frontend Igor working.
    if (opensFor(text, STOP, identity)) return true
  }
  // A comment that opens by stopping another Igor can still address this one further on.
  return addressed(text, identity, STOP)
}

/**
 * Whether a comment that opens with `verb` is meant for this identity: a bare opening is meant
 * for every Igor on the item, and one that names accounts straight after the verb only for
 * those. A stop and a go-ahead read their names here, so the two cannot be read differently.
 */
function opensFor(text: string, verb: RegExp, identity: string): boolean {
  const named = namedAfter(text, verb)
  return named.length === 0 || named.some((name) => sameAccountName(name, identity))
}

/**
 * The accounts named right after the opening `verb`: `stop @a`, `stop @a, @b`, `stop @a and @b`,
 * `stop @a, @b, and @c`, `stop @a or @b`, `stop @a and/or @b`, `stop @a & @b`, `stop @a/@b`,
 * `stop @a + @b`, and the same after a go-ahead phrase. A comma may stand alone or come before a
 * joiner (`and`, `or`, `and/or`, `&`, `/`, `+`). Empty for a bare opening, and for one whose
 * first word after the verb is not a mention.
 *
 * A mention may sit in markup or brackets (`` `@a` ``, `**@a**`, `(@a)`) and take a possessive
 * with either apostrophe, anywhere in the list: `stop @a's and @b’s work` names both.
 * A login ends on a letter or digit, so the period ending a sentence, `stop @a.`, is not part of
 * the name; `_` and `.` inside one are, as Enterprise logins carry them. The list ends at the
 * first thing that is neither a mention nor a separator between two.
 *
 * A line break ends the list unless a separator comes before it: `stop` on a line of its own,
 * followed by a paragraph addressing a person, is a bare stop, and the same holds for a go-ahead.
 */
function namedAfter(text: string, verb: RegExp): string[] {
  const mention = /[(\[*`~"']*@([A-Za-z0-9](?:[\w.-]*[A-Za-z0-9])?(?:\[bot\])?)(?:['’]s)?[)\]*`~"']*(?:['’]s)?/iy
  const separator = /[^\S\n]*(?:,\s*)?(?:(?:&|\+|\/|\band\b|\bor\b)(?:\/(?:and|or)\b)?\s*)?/iy
  const rest = text.slice(verb.exec(text)?.[0].length ?? 0)
  const names: string[] = []
  let at = /^[^\S\n]*[:,—–-]*[^\S\n]*/.exec(rest)![0].length
  for (;;) {
    mention.lastIndex = at
    const found = mention.exec(rest)
    if (found === null) return names
    names.push(found[1]!)
    separator.lastIndex = mention.lastIndex
    separator.exec(rest)
    at = separator.lastIndex
  }
}

/** Whether a mentioned name is this identity, spelled with or without the `[bot]` a bot carries. */
function sameAccountName(name: string, identity: string): boolean {
  const bare = (s: string): string => s.replace(/^@/, '').replace(/\[bot\]$/i, '').toLowerCase()
  return bare(name) === bare(identity) && bare(identity) !== ''
}

/**
 * The counterpart, which exists so a stop needs no second verb to undo it. Someone says the
 * work may resume and the cooldown is over; nothing else about the protocol changes.
 *
 * Deliberately narrow: "we should go ahead with the redesign" is a remark about the work, not
 * permission to resume, so only an opening phrase or one addressed to this Igor counts. Its names
 * are read as a stop's are (decided by Adam, 2026-10-11): a bare go-ahead lifts a stop for every
 * Igor on the item, and "go ahead @igor-backend" lifts it only for the Igors it names, so a
 * person who lets one Igor resume does not resume another.
 */
export function isGoAhead(body: string, identity: string): boolean {
  const text = body.trim()
  if (GO_AHEAD.test(text) && opensFor(text, GO_AHEAD, identity)) return true
  // A comment that opens by letting another Igor resume can still address this one further on.
  return addressed(text, identity, GO_AHEAD)
}
