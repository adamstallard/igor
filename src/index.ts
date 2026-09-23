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

export {
  loadConfig,
  findConfig,
  resolveConfig,
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
