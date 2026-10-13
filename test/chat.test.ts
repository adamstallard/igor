import { describe, expect, it } from 'vitest'
import { chatIssueBody, issueFromChat, type ChatMessage, type ChatSurface, type IssueTracker } from '../src/chat.js'

const message: ChatMessage = {
  url: 'https://discord.com/channels/1/2/3',
  author: 'adam',
  text: 'please fix the flaky upload test\nit fails on CI',
}
const request = { repo: 'o/r', title: 'Fix the flaky upload test', body: 'The upload test fails on CI.' }

function fakes(existing?: string, replied: string[] = []) {
  const created: { repo: string; body: string }[] = []
  const replies: string[] = []
  const tracker: IssueTracker = {
    findLinking: async () => existing,
    createIssue: async (repo, _title, body) => {
      created.push({ repo, body })
      return 'https://github.com/o/r/issues/9'
    },
  }
  const chat: ChatSurface = {
    hasReply: async (_m, link) => replied.some((r) => r.includes(link)),
    reply: async (_m, text) => {
      replies.push(text)
    },
  }
  return { tracker, chat, created, replies }
}

describe('an issue created from a chat message', () => {
  it('links the message, quotes it, and posts its own link back in the chat', async () => {
    const { tracker, chat, created, replies } = fakes()
    const out = await issueFromChat(tracker, chat, message, request)
    expect(out).toEqual({ issue: 'https://github.com/o/r/issues/9', created: true, posted: true })
    expect(created[0]?.body).toContain('https://discord.com/channels/1/2/3')
    expect(created[0]?.body).toContain('> please fix the flaky upload test\n> it fails on CI')
    expect(replies).toEqual(['Tracked in https://github.com/o/r/issues/9'])
  })

  it('is not created twice: an issue that links the message is found instead', async () => {
    const { tracker, chat, created, replies } = fakes('https://github.com/o/r/issues/4')
    const out = await issueFromChat(tracker, chat, message, request)
    expect(created).toEqual([])
    expect(out).toEqual({ issue: 'https://github.com/o/r/issues/4', created: false, posted: true })
    expect(replies).toEqual(['Tracked in https://github.com/o/r/issues/4'])
  })

  it('posts nothing where the chat already has the link', async () => {
    const { tracker, chat, created, replies } = fakes('https://github.com/o/r/issues/4', ['Tracked in https://github.com/o/r/issues/4'])
    expect(await issueFromChat(tracker, chat, message, request)).toEqual({
      issue: 'https://github.com/o/r/issues/4', created: false, posted: false,
    })
    expect(created).toEqual([])
    expect(replies).toEqual([])
  })

  it('writes the request first, then where it came from', () => {
    const body = chatIssueBody(message, 'Do the thing.')
    expect(body.startsWith('Do the thing.\n\nAsked for in chat by adam: https://discord.com/channels/1/2/3')).toBe(true)
  })
})
