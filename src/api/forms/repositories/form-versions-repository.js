import { getErrorMessage } from '@defra/forms-model'
import Boom from '@hapi/boom'

import { createLogger } from '~/src/helpers/logging/logger.js'
import { VERSIONS_COLLECTION_NAME, db } from '~/src/mongo.js'

export const MAX_VERSIONS = 100

const logger = createLogger()

/**
 * Creates a new form version in the database
 * @param {FormVersionDocument} versionDocument - The form version document to create
 * @param {ClientSession} session - MongoDB transaction session
 * @returns {Promise<FormVersionDocument>}
 */
export async function createVersion(versionDocument, session) {
  logger.info(`Creating new version ${versionDocument.versionNumber} for form ID ${versionDocument.formId}`)

  const coll = /** @satisfies {Collection<FormVersionDocument>} */ (db.collection(VERSIONS_COLLECTION_NAME))

  try {
    const result = await coll.insertOne(versionDocument, { session })

    logger.info(`Created version ${versionDocument.versionNumber} for form ID ${versionDocument.formId}`)

    return { ...versionDocument, _id: result.insertedId }
  } catch (err) {
    logger.error(
      err,
      `[createVersion] Failed to create version ${versionDocument.versionNumber} for form ID ${versionDocument.formId} - ${getErrorMessage(err)}`
    )

    if (err instanceof Error) {
      throw Boom.internal(err)
    }
    throw err
  }
}

/**
 * Gets the latest version number for a form
 * @param {string} formId - The form ID
 * @param {ClientSession} [session] - MongoDB transaction session
 * @returns {Promise<number>}
 */
export async function getLatestVersionNumber(formId, session) {
  logger.info(`Getting latest version number for form ID ${formId}`)

  const coll = /** @satisfies {Collection<FormVersionDocument>} */ (db.collection(VERSIONS_COLLECTION_NAME))

  try {
    const sessionOptions = /** @type {FindOptions} */ session && { session }
    const result = await coll.findOne(
      { formId },
      {
        sort: { versionNumber: -1 },
        projection: { versionNumber: 1 },
        ...sessionOptions
      }
    )

    const versionNumber = result?.versionNumber ?? 0
    logger.info(`Latest version number for form ID ${formId} is ${versionNumber}`)

    return versionNumber
  } catch (err) {
    logger.error(
      err,
      `[getLatestVersionNumber] Failed to get latest version number for form ID ${formId} - ${getErrorMessage(err)}`
    )

    if (err instanceof Error) {
      throw Boom.internal(err)
    }
    throw err
  }
}

/**
 * Gets a specific version of a form
 * @param {string} formId - The form ID
 * @param {number} versionNumber - The version number to retrieve
 * @param {ClientSession} [session] - MongoDB transaction session
 * @returns {Promise<FormVersionDocument>}
 */
export async function getVersion(formId, versionNumber, session) {
  logger.info(`Getting version ${versionNumber} for form ID ${formId}`)

  const coll = /** @satisfies {Collection<FormVersionDocument>} */ (db.collection(VERSIONS_COLLECTION_NAME))

  try {
    const sessionOptions = /** @type {FindOptions} */ session && { session }
    const result = await coll.findOne({ formId, versionNumber }, sessionOptions)

    if (!result) {
      throw Boom.notFound(`Version ${versionNumber} for form ID '${formId}' not found`)
    }

    logger.info(`Retrieved version ${versionNumber} for form ID ${formId}`)

    return result
  } catch (err) {
    logger.error(
      err,
      `[getVersion] Failed to get version ${versionNumber} for form ID ${formId} - ${getErrorMessage(err)}`
    )

    if (Boom.isBoom(err)) {
      throw err
    }

    if (err instanceof Error) {
      throw Boom.internal(err)
    }
    throw err
  }
}

/**
 * Gets the latest version of a form
 * @param {string} formId - The form ID
 * @param {ClientSession} [session] - MongoDB transaction session
 * @returns {Promise<FormVersionDocument | null>} The latest version or null if none exist
 */
export async function getLatestVersion(formId, session) {
  logger.info(`Getting latest version for form ID ${formId}`)

  const coll = /** @satisfies {Collection<FormVersionDocument>} */ (db.collection(VERSIONS_COLLECTION_NAME))

  try {
    const sessionOptions = /** @type {FindOptions} */ session && { session }
    const result = await coll.findOne(
      { formId },
      {
        sort: { versionNumber: -1 },
        ...sessionOptions
      }
    )

    if (!result) {
      logger.info(`No versions found for form ID ${formId}`)
      return null
    }

    logger.info(`Retrieved latest version ${result.versionNumber} for form ID ${formId}`)

    return result
  } catch (err) {
    logger.error(err, `[getLatestVersion] Failed to get latest version for form ID ${formId} - ${getErrorMessage(err)}`)

    if (err instanceof Error) {
      throw Boom.internal(err)
    }
    throw err
  }
}

/**
 * Gets a paginated list of versions for a form
 * @param {string} formId - The form ID
 * @param {ClientSession} [session] - MongoDB transaction session
 * @param {number} limit - Number of versions to return
 * @param {number} offset - Number of versions to skip
 * @returns {Promise<{versions: FormVersionDocument[], totalCount: number}>}
 */
export async function getVersions(formId, session, limit = 10, offset = 0) {
  logger.info(`Getting versions for form ID ${formId} (limit: ${limit}, offset: ${offset})`)

  const coll = /** @satisfies {Collection<FormVersionDocument>} */ (db.collection(VERSIONS_COLLECTION_NAME))

  try {
    const sessionOptions = /** @type {AggregateOptions} */ session && {
      session
    }
    const query = { formId }

    const [versions, totalCount] = await Promise.all([
      coll.find(query, sessionOptions).sort({ versionNumber: -1 }).skip(offset).limit(limit).toArray(),
      coll.countDocuments(query, sessionOptions)
    ])

    logger.info(`Retrieved ${versions.length} versions for form ID ${formId}`)

    return { versions, totalCount }
  } catch (err) {
    logger.error(err, `[getVersions] Failed to get versions for form ID ${formId} - ${getErrorMessage(err)}`)

    if (err instanceof Error) {
      throw Boom.internal(err)
    }
    throw err
  }
}

/**
 * Removes all versions for a form (used when deleting a form)
 * @param {string} formId - The form ID
 * @param {ClientSession} session - MongoDB transaction session
 */
export async function removeVersionsForForm(formId, session) {
  logger.info(`Removing all versions for form ID ${formId}`)

  const coll = /** @satisfies {Collection<FormVersionDocument>} */ (db.collection(VERSIONS_COLLECTION_NAME))

  try {
    const result = await coll.deleteMany({ formId }, { session })

    logger.info(`Removed ${result.deletedCount} versions for form ID ${formId}`)
  } catch (err) {
    logger.error(
      err,
      `[removeVersionsForForm] Failed to remove versions for form ID ${formId} - ${getErrorMessage(err)}`
    )

    if (err instanceof Error) {
      throw Boom.internal(err)
    }
    throw err
  }
}

/**
 * Gets version summaries for a form (without full definitions)
 * @param {string} formId - The form ID
 * @param {ClientSession} [session] - MongoDB transaction session
 * @returns {Promise<Array<{versionNumber: number, createdAt: Date}>>}
 */
export async function getVersionSummaries(formId, session) {
  logger.info(`Getting version summaries for form ID ${formId}`)

  const coll = /** @satisfies {Collection<FormVersionDocument>} */ (db.collection(VERSIONS_COLLECTION_NAME))

  try {
    const sessionOptions = /** @type {FindOptions} */ session && { session }
    const versions = await coll
      .find(
        { formId },
        {
          projection: { versionNumber: 1, createdAt: 1, _id: 0 },
          ...sessionOptions
        }
      )
      .sort({ versionNumber: -1 })
      .toArray()

    logger.info(`Retrieved ${versions.length} version summaries for form ID ${formId}`)

    return versions
  } catch (err) {
    logger.error(
      err,
      `[getVersionSummaries] Failed to get version summaries for form ID ${formId} - ${getErrorMessage(err)}`
    )

    if (err instanceof Error) {
      throw Boom.internal(err)
    }
    throw err
  }
}

/**
 * Gets version summaries for multiple forms (batch operation)
 * @param {string[]} formIds - Array of form IDs
 * @param {ClientSession} [session] - MongoDB transaction session
 * @returns {Promise<Map<string, Array<{versionNumber: number, createdAt: Date}>>>}
 */
export async function getVersionSummariesBatch(formIds, session) {
  logger.info(`Getting version summaries for ${formIds.length} forms`)

  const coll = /** @satisfies {Collection<FormVersionDocument>} */ (db.collection(VERSIONS_COLLECTION_NAME))

  try {
    const sessionOptions = /** @type {FindOptions} */ session && { session }
    const versions = await coll
      .find(
        { formId: { $in: formIds } },
        {
          projection: { formId: 1, versionNumber: 1, createdAt: 1, _id: 0 },
          ...sessionOptions
        }
      )
      .sort({ versionNumber: -1 })
      .toArray()

    const versionsByForm = new Map()
    for (const formId of formIds) {
      versionsByForm.set(formId, [])
    }

    for (const version of versions) {
      const formVersions = versionsByForm.get(version.formId) ?? []
      formVersions.push({
        versionNumber: version.versionNumber,
        createdAt: version.createdAt
      })
      versionsByForm.set(version.formId, formVersions)
    }

    logger.info(`Retrieved versions for ${versionsByForm.size} forms`)

    return versionsByForm
  } catch (err) {
    logger.error(err, `[getVersionSummariesBatch] Failed to get version summaries for batch - ${getErrorMessage(err)}`)

    if (err instanceof Error) {
      throw Boom.internal(err)
    }
    throw err
  }
}

/**
 * @import { FormVersionDocument } from '~/src/api/types.js'
 * @import { ClientSession, Collection, FindOptions } from 'mongodb'
 */
