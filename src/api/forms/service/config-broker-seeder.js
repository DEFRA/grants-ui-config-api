import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import Boom from '@hapi/boom'
import { parse } from 'yaml'

import { config } from '~/src/config/index.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import * as formMetadataRepo from '~/src/api/forms/repositories/form-metadata-repository.js'
import { getVersionBySemver, updateVersionStatus } from '~/src/api/forms/repositories/form-versions-repository.js'
import { getAllGrants, getGrantVersion } from '~/src/api/forms/service/config-broker-client.js'
import { createFormWithVersion } from '~/src/api/forms/service/index.js'

const logger = createLogger()

/** @type {FormMetadataAuthor} */
const systemAuthor = {
  id: 'system',
  displayName: 'System Seeder'
}

/**
 * Creates an S3 client using the configured AWS region and optional endpoint override.
 * @returns {S3Client}
 */
function getS3Client() {
  return new S3Client({
    region: config.get('awsRegion'),
    ...(config.get('s3Endpoint') && {
      endpoint: config.get('s3Endpoint'),
      forcePathStyle: true
    })
  })
}

/**
 * Extracts the YAML file path from a config broker manifest.
 * @param {string[]} manifest - Array of S3 object keys
 * @returns {string}
 */
function findYamlKeyInManifest(manifest) {
  const yamlKey = manifest.find((key) => key.endsWith('.yaml'))

  if (!yamlKey) {
    throw new Error(`No .yaml file found in manifest: ${manifest.join(', ')}`)
  }

  return yamlKey
}

/**
 * Fetches and parses a YAML form definition from S3.
 * @param {string} bucket - S3 bucket name (from config broker response `path` field)
 * @param {string} key - S3 object key (from manifest)
 * @param {S3Client} s3Client
 * @returns {Promise<FormDefinitionWithMetadata>}
 */
async function fetchYamlFromS3(bucket, key, s3Client) {
  logger.info(`[configBrokerSeeder] Fetching s3://${bucket}/${key}`)

  const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))

  if (!response.Body) {
    throw new Error(`Empty response body for s3://${bucket}/${key}`)
  }

  const bodyString = await response.Body.transformToString()
  const parsed = parse(bodyString)

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Failed to parse YAML at s3://${bucket}/${key}: unexpected type ${typeof parsed}`)
  }

  return /** @type {FormDefinitionWithMetadata} */ (parsed)
}

/**
 * Extracts form metadata fields from a parsed YAML form definition.
 * Falls back to configured defaults when values are absent in the definition.
 * @param {Record<string, any>} formDef - Parsed form definition
 * @param {string} slug
 * @returns {FormMetadataInputWithSlug}
 */
function extractMetadata(formDef, slug) {
  const defMeta = formDef.metadata ?? {}

  return {
    title: formDef.name,
    organisation: defMeta.organisation || config.get('defaultFormOrganisation'),
    teamName: defMeta.teamName || config.get('defaultFormTeamName'),
    teamEmail: defMeta.teamEmail || config.get('defaultFormTeamEmail'),
    notificationEmail: defMeta.notificationEmail || config.get('defaultFormNotificationEmail'),
    slug
  }
}

/**
 * Returns the existing form metadata document for a slug, or null if it does not exist.
 * @param {string} slug
 * @returns {Promise<import('mongodb').WithId<Partial<import('@defra/forms-model').FormMetadataDocument>> | null>}
 */
async function tryGetFormBySlug(slug) {
  try {
    return await formMetadataRepo.getBySlug(slug)
  } catch (err) {
    const HTTP_NOT_FOUND = 404
    if (Boom.isBoom(err) && err.output.statusCode === HTTP_NOT_FOUND) {
      return null
    }
    throw err
  }
}

/**
 * Seeds or updates a single version of a grant form from the config broker and S3.
 *
 * - If the version already exists with the same status: skipped.
 * - If the version already exists with a different status: status is updated.
 * - If the version does not exist: YAML is fetched from S3 and the form+version is created.
 * @param {string} slug
 * @param {string} version - Semver string e.g. "1.0.0"
 * @param {'active' | 'draft'} status
 * @param {import('./config-broker-client.js').ConfigBrokerVersionDetail} versionDetail
 * @param {S3Client} s3Client
 */
async function seedFormVersion(slug, version, status, versionDetail, s3Client) {
  const existingForm = await tryGetFormBySlug(slug)

  if (existingForm) {
    const formId = existingForm._id.toString()
    const existingVersion = await getVersionBySemver(formId, version)

    if (existingVersion) {
      if (existingVersion.status === status) {
        logger.info(`[configBrokerSeeder] ${slug}@${version} already up to date (status: ${status}), skipping`)
        return
      }

      logger.info(`[configBrokerSeeder] Updating status of ${slug}@${version}: ${existingVersion.status} → ${status}`)
      await updateVersionStatus(formId, version, status)
      return
    }
  }

  logger.info(`[configBrokerSeeder] Creating ${slug}@${version} (status: ${status})`)

  const yamlKey = findYamlKeyInManifest(versionDetail.manifest)
  const formDef = await fetchYamlFromS3(versionDetail.path, yamlKey, s3Client)
  const metadataInput = extractMetadata(formDef, slug)

  await createFormWithVersion(metadataInput, formDef, version, status, systemAuthor)

  logger.info(`[configBrokerSeeder] Successfully seeded ${slug}@${version}`)
}

/**
 * Seeds grant forms from the config broker on startup.
 *
 * Flow:
 * 1. Calls the config broker `/api/allGrants` to get available grants and versions.
 * 2. Filters to only the slugs listed in `FORMS_API_SLUGS`.
 * 3. For each matching grant version:
 *    - Skips if already in MongoDB with the same status.
 *    - Updates status if it has changed.
 *    - Creates form+version if not yet in MongoDB (fetches YAML from S3).
 *
 * Errors for individual grant versions are logged but do not prevent other versions
 * or slugs from being processed, nor do they prevent the server from starting.
 */
export async function seedFormsFromConfigBroker() {
  const brokerUrl = config.get('configBrokerUrl')
  const slugsRaw = config.get('formsApiSlugs')

  if (!brokerUrl || !slugsRaw) {
    logger.info(
      '[configBrokerSeeder] GRANTS_CONFIG_BROKER_URL or FORMS_API_SLUGS not set, skipping config broker seeding'
    )
    return
  }

  const slugs = new Set(
    slugsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  )

  if (!slugs.size) {
    logger.info('[configBrokerSeeder] FORMS_API_SLUGS is empty, skipping config broker seeding')
    return
  }

  logger.info(`[configBrokerSeeder] Starting config broker seeding for slugs: ${[...slugs].join(', ')}`)

  let allGrants
  try {
    allGrants = await getAllGrants(brokerUrl)
  } catch (err) {
    logger.error(err, '[configBrokerSeeder] Failed to fetch grants from config broker, skipping seeding')
    return
  }

  const matchingGrants = allGrants.filter((g) => slugs.has(g.grant))

  logger.info(`[configBrokerSeeder] Found ${matchingGrants.length} matching grant(s) in config broker response`)

  const s3Client = getS3Client()

  for (const grant of matchingGrants) {
    const slug = grant.grant

    for (const versionInfo of grant.versions) {
      const { version, status } = versionInfo

      try {
        const versionDetail = await getGrantVersion(brokerUrl, slug, version)
        await seedFormVersion(slug, version, status, versionDetail, s3Client)
      } catch (err) {
        logger.error(err, `[configBrokerSeeder] Failed to seed ${slug}@${version}, continuing with remaining versions`)
      }
    }
  }

  logger.info('[configBrokerSeeder] Config broker seeding complete')
}

/**
 * @import { FormMetadataAuthor } from '@defra/forms-model'
 * @import { FormMetadataInputWithSlug, FormDefinitionWithMetadata } from '~/src/api/types.js'
 */
