import type { Tracker } from './adapter.js'

/**
 * Work asked for in chat, turned into an issue on the claiming tracker.
 *
 * A chat surface such as Discord directs work and never holds a claim: it has no holder field,
 * so a claim there would be a bare message with nothing to verify. A person asks in a channel,
 * and the Igor opens an issue on the claiming tracker that links the message, then posts the
 * issue's link back in the chat. The claim is taken on the tracker, by the ordinary path.
 *
 * **The link prevents a duplicate issue, not any record of handled messages.** Before creating
 * an issue the Igor looks on the tracker for one that already links the message, and creates
 * none if it finds one. A chat surface's record of where it stopped reading is only a cache: a
 * lost or stale one costs a search, never a second issue.
 */

/** One message in a chat, as the chat surface reports it. */
export interface ChatMessage {
  /** The message's own link, which the issue carries and the duplicate check searches for. */
  url: string
  author: string
  text: string
}

/** What this module needs of a chat surface. The polling and the channel marker are the surface's. */
export interface ChatSurface {
  /** Whether a reply to `message` in the chat already carries `link`. */
  hasReply(message: ChatMessage, link: string): Promise<boolean>
  /** Replies to `message` in the chat. */
  reply(message: ChatMessage, text: string): Promise<void>
}

/** What this module needs of the claiming tracker. */
export type IssueTracker = Pick<Tracker, 'findLinking' | 'createIssue'>

export interface ChatRequest {
  /** Where the issue is created. */
  repo: string
  title: string
  /** What the issue says the work is; the link to the message is added to it. */
  body: string
}

export interface ChatOutcome {
  /** The issue that links the message. */
  issue: string
  created: boolean
  /** Whether the issue's link was posted in the chat by this call. */
  posted: boolean
}

/** The issue body: the request, then the message it came from, linked and quoted. */
export function chatIssueBody(message: ChatMessage, body: string): string {
  const quoted = message.text
    .trim()
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')
  return `${body.trim()}\n\nAsked for in chat by ${message.author}: ${message.url}\n\n${quoted}\n`
}

/**
 * Makes sure an issue links `message`, and that the chat has its link.
 *
 * Safe to call again for a message already handled, which is what makes the chat surface's
 * marker a cache: an issue that links the message is found rather than created again, and its
 * link is posted only where the chat has no reply carrying it. So an Igor stopped between
 * creating the issue and posting its link posts the link on its next read, and never twice.
 */
export async function issueFromChat(
  tracker: IssueTracker,
  chat: ChatSurface,
  message: ChatMessage,
  request: ChatRequest,
): Promise<ChatOutcome> {
  const found = await tracker.findLinking(request.repo, message.url)
  const created = found === undefined
  const issue =
    found ?? (await tracker.createIssue(request.repo, request.title, chatIssueBody(message, request.body)))
  if (!created && (await chat.hasReply(message, issue))) return { issue, created, posted: false }
  await chat.reply(message, `Tracked in ${issue}`)
  return { issue, created, posted: true }
}
