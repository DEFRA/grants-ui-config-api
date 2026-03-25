import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import Boom from '@hapi/boom'
import { parse } from 'yaml'

import { config } from '~/src/config/index.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import * as formMetadataRepo from '~/src/api/forms/repositories/form-metadata-repository.js'
import { createForm } from '~/src/api/forms/service/index.js'
import { createLiveFromDraft, updateDraftFormDefinition } from '~/src/api/forms/service/definition.js'

const logger = createLogger()

const HTTP_NOT_FOUND = 404

/** @type {FormMetadataAuthor} */
const systemAuthor = {
  id: 'system',
  displayName: 'System Seeder'
}

/**
 * Creates an S3 client configured for the forms config bucket
 * @returns {S3Client}
 */
function getFormsConfigS3Client() {
  return new S3Client({
    region: config.get('awsRegion'),
    ...(config.get('s3Endpoint') && {
      endpoint: config.get('s3Endpoint'),
      forcePathStyle: true
    })
  })
}

/**
 * Extracts form metadata fields from a YAML form definition.
 * Falls back to configured defaults when values are not set in the definition.
 * Note: "metadata" here means the Mongo form-metadata document fields, which
 * is distinct from the "metadata" object within the form definition itself.
 * @param {Record<string, any>} formDef - Parsed form definition from YAML
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
 * Compares two semver strings (e.g. "0.0.5" vs "0.1.0").
 * Returns negative if a < b, positive if a > b, 0 if equal.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareSemver(a, b) {
  const partsA = a.split('.').map(Number)
  const partsB = b.split('.').map(Number)
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0)
    if (diff !== 0) {
      return diff
    }
  }
  return 0
}

/**
 * Lists all version strings available for a slug in S3.
 * Keys follow the pattern: {slug}/{version}/grants-ui/{slug}.yaml
 * @param {string} slug
 * @param {string} bucket
 * @param {S3Client} s3Client
 * @returns {Promise<string[]>} Sorted array of version strings (ascending)
 */
async function listVersionsForSlug(slug, bucket, s3Client) {
  const prefix = `${slug}/`
  const response = await s3Client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, Delimiter: '/' }))

  // CommonPrefixes contains entries like "example-grant-with-auth/0.0.5/"
  const versions = (response.CommonPrefixes ?? [])
    .map((p) => p.Prefix?.replace(prefix, '').replace('/', '') ?? '')
    .filter(Boolean)
    .sort(compareSemver)

  return versions
}

/**
 * Fetches and parses a YAML form definition from S3.
 * Key format: {slug}/{version}/grants-ui/{slug}.yaml
 * Automatically resolves the latest version by listing the bucket.
 * @param {string} slug
 * @param {S3Client} s3Client
 * @returns {Promise<{ formDef: FormDefinitionWithMetadata, version: string }>}
 */
async function fetchFormDefinitionFromS3(slug, s3Client) {
  const bucket = config.get('formsConfigBucket')

  const versions = await listVersionsForSlug(slug, bucket, s3Client)

  if (!versions.length) {
    throw new Error(`No versions found in s3://${bucket}/${slug}/`)
  }

  const latestVersion = versions[versions.length - 1]
  const key = `${slug}/${latestVersion}/grants-ui/${slug}.yaml`

  logger.info(`[s3Seeder] Fetching s3://${bucket}/${key} (latest of: ${versions.join(', ')})`)

  const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))

  if (!response.Body) {
    throw new Error(`Empty response body for s3://${bucket}/${key}`)
  }

  const bodyString = await response.Body.transformToString()
  const parsed = parse(bodyString)

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Failed to parse YAML for slug '${slug}': unexpected type ${typeof parsed}`)
  }

  return { formDef: /** @type {FormDefinitionWithMetadata} */ (parsed), version: latestVersion }
}

/**
 * Returns true if a form with the given slug already exists in MongoDB.
 * @param {string} slug
 * @returns {Promise<boolean>}
 */
async function slugExistsInMongo(slug) {
  try {
    await formMetadataRepo.getBySlug(slug)
    return true
  } catch (err) {
    if (Boom.isBoom(err) && err.output.statusCode === HTTP_NOT_FOUND) {
      return false
    }
    throw err
  }
}

/**
 * Seeds a single form from S3 into MongoDB.
 * Skips if the slug already exists. Creates the form, loads the definition
 * from S3 as a draft, then publishes it live.
 * @param {string} slug
 * @param {S3Client} s3Client
 */
async function seedForm(slug, s3Client) {
  if (await slugExistsInMongo(slug)) {
    logger.info(`[s3Seeder] Slug '${slug}' already exists in MongoDB, skipping`)
    return
  }

  logger.info(`[s3Seeder] Seeding form '${slug}' from S3`)

  const { formDef, version } = await fetchFormDefinitionFromS3(slug, s3Client)
  const metadataInput = extractMetadata(formDef, slug)

  // Create the form record with an empty definition and draft state
  const form = await createForm({ ...metadataInput, slug }, systemAuthor)

  // Replace the empty draft with the definition loaded from S3
  await updateDraftFormDefinition(form.id, formDef, systemAuthor)

  // Publish the draft as live
  await createLiveFromDraft(form.id, systemAuthor)

  logger.info(`[s3Seeder] Successfully seeded form '${slug}' v${version} (id: ${form.id})`)
}

/**
 * Seeds forms from S3 into MongoDB on startup.
 * Reads FORMS_API_SLUGS and FORMS_CONFIG_BUCKET_NAME from config.
 * Skips silently if either is not configured. Errors for individual slugs
 * are logged but do not prevent remaining slugs or the server from starting.
 */
export async function seedFormsFromS3() {
  const slugsRaw = config.get('formsApiSlugs')
  const bucket = config.get('formsConfigBucket')

  if (!slugsRaw || !bucket) {
    logger.info('[s3Seeder] FORMS_API_SLUGS or FORMS_CONFIG_BUCKET_NAME not set, skipping S3 form seeding')
    return
  }

  const slugs = slugsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  if (!slugs.length) {
    logger.info('[s3Seeder] FORMS_API_SLUGS is empty, skipping S3 form seeding')
    return
  }

  logger.info(`[s3Seeder] Seeding ${slugs.length} form(s) from S3 bucket '${bucket}': ${slugs.join(', ')}`)

  const s3Client = getFormsConfigS3Client()

  for (const slug of slugs) {
    try {
      await seedForm(slug, s3Client)
    } catch (err) {
      logger.error(err, `[s3Seeder] Failed to seed form '${slug}', continuing with remaining slugs`)
    }
  }

  logger.info('[s3Seeder] S3 form seeding complete')
}

/**
 * @import { FormMetadataAuthor } from '@defra/forms-model'
 * @import { FormMetadataInputWithSlug, FormDefinitionWithMetadata } from '~/src/api/types.js'
 */
