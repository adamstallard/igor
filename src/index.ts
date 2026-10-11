export {
  validateFrontmatter,
  isValidScope,
  STATUSES,
  DERIVED_FIELDS,
  type Entry,
  type Status,
  type Conditions,
  type ProvenanceItem,
  type Reviewed,
  type ValidationError,
} from './entry.js'

export { slugFromClaim, uniqueId } from './id.js'

export { score, scoreEntry, type Scores, type ScoringOptions } from './scoring.js'

export {
  serialize,
  loadAll,
  loadEntry,
  writeEntry,
  listFiles,
  takenIds,
  rejectedIds,
  writeRejection,
  supersessionIndex,
  resolveCurrent,
  StoreError,
  ENTRIES_DIR,
  REJECTED_DIR,
  type LoadedEntry,
  type Rejection,
} from './store.js'

// `resolveConfig` is deliberately not exported. It is the pure parser, and the
// root-of-its-repository refusal lives in `loadConfig` above it, so a caller reaching the parser
// directly gets a destination checked against the Igor installation but not against git —
// validated enough to look validated. `loadConfig` is the only supported way in.
export {
  loadConfig,
  findConfig,
  igorRoot,
  ConfigError,
  DEFAULT_CONFIG_FILENAME,
  EXAMPLE_CONFIG_FILENAME,
  type Config,
} from './config.js'

export {
  propose,
  eligibleToPropose,
  pullRequestBody,
  dominantAuthor,
  contributingAuthors,
  groupByDominant,
  checkProvenanceVisibility,
  ProposeError,
  BRANCH_PREFIX,
  type ProposalResult,
  type ProposeOutcome,
  type Eligibility,
} from './propose.js'

export { reconcile, type Reconciliation } from './reconcile.js'

export { GitHubError, repoFromCheckout } from './github.js'
