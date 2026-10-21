import { describe, expect, it } from 'vitest'
import { redact, rememberUrlCredentials } from '../src/redact.js'

describe("a proxy URL's user name with no password", () => {
  it('a mixed-case token whose digits come only at the end is registered', () => {
    rememberUrlCredentials('http://eIdzgfAshpjKnBZECmsq@proxy.corp:3128')
    expect(redact('x eIdzgfAshpjKnBZECmsq y', {})).toBe('x [redacted] y')
  })

  it('a base64url token whose words are letters then digits is registered', () => {
    rememberUrlCredentials('http://ejQ5_thwhlpoTSFY9-BT@proxy.corp:3128')
    expect(redact('x ejQ5_thwhlpoTSFY9-BT y', {})).toBe('x [redacted] y')
  })

  it('a login with a word of digits, or a word starting with digits, is not registered', () => {
    rememberUrlCredentials('http://ci-runner-2024-proxyuser@proxy.corp:3128')
    rememberUrlCredentials('http://jdoe-3rd-party-contractor@proxy.corp:3128')
    expect(redact('github:ci-runner-2024-proxyuser/igor#3', {})).toBe('github:ci-runner-2024-proxyuser/igor#3')
    expect(redact('github:jdoe-3rd-party-contractor/igor#3', {})).toBe('github:jdoe-3rd-party-contractor/igor#3')
  })

  it('a DOMAIN\\user login, or one with non-ASCII letters, is not registered', () => {
    rememberUrlCredentials('http://CORPORATE%5Cjane.doe.smith@proxy.corp:3128')
    rememberUrlCredentials('http://jose.garc%C3%ADa.lopez.ext@proxy.corp:3128')
    expect(redact('user CORPORATE\\jane.doe.smith', {})).toBe('user CORPORATE\\jane.doe.smith')
    expect(redact('user jose.garcía.lopez.ext', {})).toBe('user jose.garcía.lopez.ext')
  })
})

describe("a proxy URL's user name with an empty password", () => {
  it('is judged as a user name with no password, so a plain login is not registered', () => {
    rememberUrlCredentials('http://adamstallard:@proxy.corp:3128')
    expect(redact('@adamstallard: approved; github:adamstallard/igor#3', {})).toBe(
      '@adamstallard: approved; github:adamstallard/igor#3',
    )
    rememberUrlCredentials('http://build-agent.proxy-user01:@proxy.corp:3128')
    expect(redact('@build-agent.proxy-user01: approved', {})).toBe('@build-agent.proxy-user01: approved')
  })
})

describe("the user-name rule's length", () => {
  it('is measured on the decoded name, so an 18-character login written with an escape is not registered', () => {
    rememberUrlCredentials('http://patrick.o%27brien.jr@proxy.corp:3128')
    expect(redact("login patrick.o'brien.jr", {})).toBe("login patrick.o'brien.jr")
  })

  it('a long user name of digit words that fails the plain-name shape is judged quickly', () => {
    const user = `${'111.'.repeat(40)}x!aaaaa`
    const start = performance.now()
    rememberUrlCredentials(`http://${user}@proxy.corp:3128`)
    expect(performance.now() - start).toBeLessThan(1000)
    expect(redact(`x ${user} y`, {})).toBe('x [redacted] y')
  })
})

describe('a token used as the user name with an empty password', () => {
  it('is registered', () => {
    rememberUrlCredentials('http://eIdzgfAshpjKnBZECmtr:@proxy.corp:3128')
    expect(redact('x eIdzgfAshpjKnBZECmtr y', {})).toBe('x [redacted] y')
  })
})
