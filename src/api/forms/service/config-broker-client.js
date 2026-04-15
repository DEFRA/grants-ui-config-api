import { createLogger } from '~/src/helpers/logging/logger.js'

const logger = createLogger()

/**
 * Fetches the list of all grants and their available versions from the config broker.
 * @param {string} baseUrl - Config broker base URL
 * @returns {Promise<ConfigBrokerGrant[]>}
 */
export async function getAllGrants(baseUrl) {
  const url = `${baseUrl}/api/allGrants`

  logger.info(`[configBrokerClient] Fetching all grants from ${url}`)

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Config broker GET ${url} failed with status ${response.status}`)
  }

  const data = /** @type {ConfigBrokerGrant[]} */ (await response.json())

  logger.info(`[configBrokerClient] Received ${data.length} grant(s) from config broker`)

  return data
}

/**
 * Fetches the version manifest for a specific grant version from the config broker.
 * @param {string} baseUrl - Config broker base URL
 * @param {string} grant - The grant slug
 * @param {string} version - The semantic version string (e.g. "1.0.0")
 * @returns {Promise<ConfigBrokerVersionDetail>}
 */
export async function getGrantVersion(baseUrl, grant, version) {
  const url = `${baseUrl}/api/version?grant=${encodeURIComponent(grant)}&version=${encodeURIComponent(version)}`

  logger.info(`[configBrokerClient] Fetching version detail from ${url}`)

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Config broker GET ${url} failed with status ${response.status}`)
  }

  const data = /** @type {ConfigBrokerVersionDetail} */ (await response.json())

  logger.info(`[configBrokerClient] Received version detail for ${grant}@${version}`)

  return data
}

/**
 * @typedef {object} ConfigBrokerVersionInfo
 * @property {string} version - Semantic version string e.g. "1.0.0"
 * @property {'active' | 'draft'} status - Whether this version is active or draft
 * @property {string} lastUpdated - ISO date string
 */

/**
 * @typedef {object} ConfigBrokerGrant
 * @property {string} grant - The grant slug
 * @property {ConfigBrokerVersionInfo[]} versions - Available versions for this grant
 */

/**
 * @typedef {object} ConfigBrokerVersionDetail
 * @property {string} grant - The grant slug
 * @property {string} version - Semantic version string
 * @property {'active' | 'draft'} status - Whether this version is active or draft
 * @property {string} path - S3 bucket name
 * @property {string[]} manifest - S3 object keys included in this version
 * @property {string} lastUpdated - ISO date string
 */
