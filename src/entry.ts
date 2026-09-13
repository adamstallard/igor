import picomatch from 'picomatch'

export const STATUSES = ['provisional', 'active', 'deprecated'] as const
export type Status = (typeof STATUSES)[number]

/** Derived at read time, never stored. Rejected if present in frontmatter. */
export const DERIVED_FIELDS = ['support', 'recency'] as const

export interface ProvenanceItem {
  /** Absent when the entry was authored directly rather than mined. */
  url?: string
  author: string
  /** ISO date, YYYY-MM-DD. */
  at: string
}

export interface Conditions {
  /** Glob predicates. Absent when a cluster's sources shared no common pattern. */
  paths?: string[]
  prose: string
}

export interface Reviewed {
  by: string
  at: string
}

export interface Entry {
  id: string
  claim: string
  scope: string
  status: Status
  conditions: Conditions
  provenance: ProvenanceItem[]
  supersedes: string[]
  reviewed?: Reviewed
  /** Markdown after the frontmatter: reasoning and exceptions. */
  body: string
}

export interface ValidationError {
  field: string
  message: string
}

const SCOPE_PATTERN = /^(global|role:[a-z0-9][a-z0-9-]*|project:[a-z0-9][a-z0-9-]*)$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

function validDate(v: unknown): boolean {
  return typeof v === 'string' && ISO_DATE.test(v) && !Number.isNaN(Date.parse(v))
}

function validateProvenance(raw: unknown, errors: ValidationError[]): void {
  if (!Array.isArray(raw)) {
    errors.push({ field: 'provenance', message: 'must be an array' })
    return
  }
  if (raw.length === 0) {
    errors.push({
      field: 'provenance',
      message:
        'must not be empty — an entry records where it came from even when the answer is that someone wrote it',
    })
    return
  }
  raw.forEach((item, i) => {
    const at = `provenance[${i}]`
    if (!isRecord(item)) {
      errors.push({ field: at, message: 'must be an object' })
      return
    }
    if (!isNonEmptyString(item['author'])) {
      errors.push({ field: `${at}.author`, message: 'is required' })
    }
    if (!validDate(item['at'])) {
      errors.push({ field: `${at}.at`, message: 'must be an ISO date (YYYY-MM-DD)' })
    }
    if (item['url'] !== undefined && !isNonEmptyString(item['url'])) {
      errors.push({ field: `${at}.url`, message: 'must be a non-empty string when present' })
    }
  })
}

function validateConditions(raw: unknown, errors: ValidationError[]): void {
  if (!isRecord(raw)) {
    errors.push({ field: 'conditions', message: 'must be an object' })
    return
  }
  if (!isNonEmptyString(raw['prose'])) {
    errors.push({ field: 'conditions.prose', message: 'is required and must be non-empty' })
  }
  const paths = raw['paths']
  if (paths === undefined) return
  if (!Array.isArray(paths) || paths.length === 0) {
    errors.push({ field: 'conditions.paths', message: 'must be a non-empty array when present' })
    return
  }
  paths.forEach((p, i) => {
    if (!isNonEmptyString(p)) {
      errors.push({ field: `conditions.paths[${i}]`, message: 'must be a non-empty string' })
      return
    }
    try {
      picomatch(p)
    } catch {
      errors.push({ field: `conditions.paths[${i}]`, message: `is not a valid glob: ${p}` })
    }
  })
}

/**
 * `reviewed` is required only for active entries. A provisional entry has not been
 * reviewed by definition, so requiring it would make a freshly created entry invalid.
 */
function validateReviewed(raw: unknown, status: unknown, errors: ValidationError[]): void {
  if (raw === undefined) {
    if (status === 'active') {
      errors.push({ field: 'reviewed', message: 'is required when status is active' })
    }
    return
  }
  if (!isRecord(raw)) {
    errors.push({ field: 'reviewed', message: 'must be an object' })
    return
  }
  if (!isNonEmptyString(raw['by'])) {
    errors.push({ field: 'reviewed.by', message: 'is required' })
  }
  if (!validDate(raw['at'])) {
    errors.push({ field: 'reviewed.at', message: 'must be an ISO date (YYYY-MM-DD)' })
  }
}

/**
 * Validates parsed frontmatter. Returns every problem found rather than stopping at the
 * first, so `validate` can report a whole store in one pass.
 */
export function validateFrontmatter(data: unknown): ValidationError[] {
  const errors: ValidationError[] = []
  if (!isRecord(data)) {
    return [{ field: '', message: 'frontmatter must be a mapping' }]
  }

  for (const field of DERIVED_FIELDS) {
    if (field in data) {
      errors.push({
        field,
        message: `is derived from provenance and must not be stored — it would desync as soon as time passed`,
      })
    }
  }

  if (!isNonEmptyString(data['id'])) {
    errors.push({ field: 'id', message: 'is required' })
  } else if (!ID_PATTERN.test(data['id'])) {
    errors.push({ field: 'id', message: 'must be a kebab-case slug' })
  }

  if (!isNonEmptyString(data['claim'])) {
    errors.push({ field: 'claim', message: 'is required' })
  }

  if (!isNonEmptyString(data['scope'])) {
    errors.push({ field: 'scope', message: 'is required' })
  } else if (!SCOPE_PATTERN.test(data['scope'])) {
    errors.push({
      field: 'scope',
      message: `must be global, role:<name>, or project:<name> — got "${data['scope']}"`,
    })
  }

  if (!isNonEmptyString(data['status'])) {
    errors.push({ field: 'status', message: 'is required' })
  } else if (!(STATUSES as readonly string[]).includes(data['status'])) {
    errors.push({ field: 'status', message: `must be one of ${STATUSES.join(', ')}` })
  }

  validateConditions(data['conditions'], errors)
  validateProvenance(data['provenance'], errors)
  validateReviewed(data['reviewed'], data['status'], errors)

  const supersedes = data['supersedes']
  if (!Array.isArray(supersedes)) {
    errors.push({ field: 'supersedes', message: 'must be an array (empty is fine)' })
  } else if (supersedes.some((s) => !isNonEmptyString(s))) {
    errors.push({ field: 'supersedes', message: 'must contain only entry ids' })
  }

  return errors
}

/** Scope is a label, not a reference: `role:frontend` needs no role to exist. */
export function isValidScope(scope: string): boolean {
  return SCOPE_PATTERN.test(scope)
}
