/**
 * Shared types for the composer (JSDoc-only; no runtime).
 */

/**
 * @typedef {"address"|"uint256"|"bytes32"|"bytes"|"string"|"boolean"|"selector"} FieldType
 */

/**
 * @typedef {Object} ModuleConfigField
 * @property {string} key
 * @property {string} label
 * @property {FieldType} type
 * @property {boolean} [required]
 * @property {string} [default]
 * @property {string} [description]
 */

/**
 * @typedef {"sign"|"batch"|"session"|"delegate"} ModuleCategory
 */

/**
 * @typedef {Object} ComposerModule
 * @property {string} id
 * @property {string} name
 * @property {ModuleCategory} category
 * @property {string} description
 * @property {ModuleConfigField[]} fields
 * @property {string[]} runtimeDeps
 */

/**
 * @typedef {Object} ProcessStep
 * @property {string} moduleId
 * @property {Record<string, string>} config   per-client resolved config values
 */

/**
 * @typedef {Object} ClientConfig
 * @property {string} id                 client slug, e.g. "client-x"
 * @property {string} name               display name
 * @property {string} chainId            target chain id
 * @property {string} rpcUrl             RPC endpoint
 * @property {string} [reownProjectId]   Reown Cloud project id for wallet connect
 * @property {ProcessStep[]} process     ordered list of steps
 */

module.exports = {};
