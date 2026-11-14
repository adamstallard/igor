import type { Accounts } from '../src/signals.js'

/**
 * The accounts the name-reading tests treat as Igors, as a tracker would resolve them. A name not
 * here is one the tracker could not resolve.
 */
export const IGORS: Accounts = {
  igor: 'igor',
  'igor-backend': 'igor',
  'igor-frontend': 'igor',
  'igor-docs': 'igor',
  igor_backend: 'igor',
  'igor-bot': 'igor',
  'igor-other': 'igor',
  'igor-reviewer': 'igor',
  'igor-generalist': 'igor',
  'acme-igor-generalist': 'igor',
  reviewer: 'igor',
  'code-reviewer': 'igor',
}
