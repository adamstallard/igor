import { describe, expect, it } from 'vitest'
import { escapeRegExp, oneLine, singleFullStop, withoutFullStop } from '../src/text.js'

describe('escapeRegExp', () => {
  it('makes every metacharacter literal', () => {
    const text = 'a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o'
    expect(new RegExp(`^${escapeRegExp(text)}$`).test(text)).toBe(true)
  })

  it('no longer matches what the unescaped pattern would', () => {
    expect(new RegExp(`^${escapeRegExp('igor.tree-')}$`).test('igorXtree-')).toBe(false)
  })

  it('leaves characters that need no escaping alone', () => {
    expect(escapeRegExp('igor-bot/a_b')).toBe('igor-bot/a_b')
  })
})

describe('oneLine', () => {
  it('collapses every run of whitespace, line breaks included, to one space', () => {
    expect(oneLine('a  b\n\tc\r\n\nd')).toBe('a b c d')
  })

  it('trims both ends', () => {
    expect(oneLine('  \n a b \n ')).toBe('a b')
  })

  it('reads whitespace-only text as empty', () => {
    expect(oneLine(' \n\t ')).toBe('')
  })
})

describe('singleFullStop', () => {
  it('adds a full stop to a sentence without one', () => {
    expect(singleFullStop('export it')).toBe('export it.')
  })

  it('keeps the full stop a sentence already ends in, rather than doubling it', () => {
    expect(singleFullStop('export it.')).toBe('export it.')
  })

  it('drops only one trailing full stop, so an ellipsis keeps its dots', () => {
    expect(singleFullStop('wait..')).toBe('wait..')
  })
})

describe('withoutFullStop', () => {
  it('drops the one full stop a sentence ends in', () => {
    expect(withoutFullStop('add the label again.')).toBe('add the label again')
  })

  it('leaves a sentence without one as it is', () => {
    expect(withoutFullStop('add the label again')).toBe('add the label again')
  })

  it('drops only the last of several', () => {
    expect(withoutFullStop('wait...')).toBe('wait..')
  })
})
