import { describe, expect, it } from 'vitest'
import { redact, rememberUrlCredentials } from '../src/redact.js'

describe("a proxy URL's user name with no password is registered with its host", () => {
  it('a token used as the user name is redacted where it is quoted with its host', () => {
    rememberUrlCredentials('http://x7Kp2mQ9vL@proxy-a.corp:3128')
    expect(redact('auth for x7Kp2mQ9vL@proxy-a.corp failed', {})).toBe('auth for [redacted] failed')
    expect(redact('CONNECT via x7Kp2mQ9vL@proxy-a.corp:3128', {})).toBe('CONNECT via [redacted]:3128')
    expect(redact('via http://x7Kp2mQ9vL@proxy-a.corp:3128/', {})).toBe('via [redacted]/')
  })

  it('the bare user name is not redacted, however much it looks like a token', () => {
    rememberUrlCredentials('http://eIdzgfAshpjKnBZECmsq@proxy-b.corp:3128')
    expect(redact('x eIdzgfAshpjKnBZECmsq y', {})).toBe('x eIdzgfAshpjKnBZECmsq y')
  })

  it("a login is never redacted from an item id, whatever its shape", () => {
    rememberUrlCredentials('http://JaneDoeContractor2024@proxy-c.corp:3128')
    rememberUrlCredentials('http://team-infra-k8s-runners@proxy-c.corp:3128')
    expect(redact('github:JaneDoeContractor2024/igor#3', {})).toBe('github:JaneDoeContractor2024/igor#3')
    expect(redact('github:team-infra-k8s-runners/igor#3', {})).toBe('github:team-infra-k8s-runners/igor#3')
  })

  it('the user name is matched as written, percent-decoded and percent-encoded', () => {
    rememberUrlCredentials('http://CORP%5Cjane.doe@proxy-d.corp:3128')
    expect(redact('as CORP%5Cjane.doe@proxy-d.corp', {})).toBe('as [redacted]')
    expect(redact('as CORP\\jane.doe@proxy-d.corp', {})).toBe('as [redacted]')
    rememberUrlCredentials('http://CORP\\svc.build@proxy-d.corp:3128')
    expect(redact('as CORP%5Csvc.build@proxy-d.corp', {})).toBe('as [redacted]')
  })

  it('an IPv6 host is taken whole, with its brackets', () => {
    rememberUrlCredentials('http://w9RtQ2zLp@[2001:db8::1]:3128')
    expect(redact('as w9RtQ2zLp@[2001:db8::1] refused', {})).toBe('as [redacted] refused')
  })

  it('a URL naming no host registers nothing', () => {
    rememberUrlCredentials('http://k4VnB8sXq2@')
    expect(redact('x k4VnB8sXq2 y k4VnB8sXq2@', {})).toBe('x k4VnB8sXq2 y k4VnB8sXq2@')
  })
})

describe("a proxy URL's user name with an empty password", () => {
  it('is registered with its host, as a user name with no password is', () => {
    rememberUrlCredentials('http://eIdzgfAshpjKnBZECmtr:@proxy-e.corp:3128')
    expect(redact('as eIdzgfAshpjKnBZECmtr@proxy-e.corp', {})).toBe('as [redacted]')
    expect(redact('as eIdzgfAshpjKnBZECmtr:@proxy-e.corp', {})).toBe('as [redacted]')
    expect(redact('@eIdzgfAshpjKnBZECmtr: approved', {})).toBe('@eIdzgfAshpjKnBZECmtr: approved')
  })
})
