import { getErrorMessage } from '@defra/forms-model'
import Boom from '@hapi/boom'
import { MongoServerError, ObjectId } from 'mongodb'

import { FormAlreadyExistsError } from '~/src/api/forms/errors.js'
import {
  buildAggregationPipeline,
  buildAggregationPipelineWithVersions,
  buildFilterConditions,
  buildFiltersFacet,
  processFilterResults
} from '~/src/api/forms/repositories/aggregation/form-metadata-aggregation.js'
import { removeById } from '~/src/api/forms/repositories/helpers.js'
import { MongoError, partialAuditFields } from '~/src/api/forms/service/shared.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import { METADATA_COLLECTION_NAME, db } from '~/src/mongo.js'

export const MAX_RESULTS = 100

const logger = createLogger()

/**
 * Retrieves the list of documents from the database
 */
export async function listAll() {
  const coll = /** @type {Collection<Partial<FormMetadataDocument>>} */ (db.collection(METADATA_COLLECTION_NAME))

  return coll
    .find()
    .sort({
      updatedAt: -1
    })
    .limit(MAX_RESULTS)
    .toArray()
}

/**
 * Retrieves the list of documents from the database with pagination and sorting.
 * Applies ranking to the search results based on match type and sorts them accordingly.
 * @param {QueryOptions} options - Pagination, sorting, and filtering options.
 * @returns {Promise<{ documents: WithId<Partial<FormMetadataDocument>>[], totalItems: number, filters: FilterOptions }>}
 */
export async function list(options) {
  try {
    const {
      page,
      perPage,
      sortBy = 'updatedAt',
      order = 'desc',
      title = '',
      author = '',
      organisations = [],
      status = []
    } = options

    const coll = /** @type {Collection<Partial<FormMetadataDocument>>} */ (db.collection(METADATA_COLLECTION_NAME))

    const skip = (page - 1) * perPage

    const [filterResults] = /** @type {[FilterAggregationResult]} */ (
      await coll.aggregate([buildFiltersFacet()]).toArray()
    )

    const filters = processFilterResults(filterResults)

    const { pipeline, aggOptions } = buildAggregationPipeline(sortBy, order, title, author, organisations, status)

    pipeline.push({ $skip: skip }, { $limit: perPage }, { $project: { versions: 0 } })

    const [documents, totalItems] = await Promise.all([
      /** @type {Promise<WithId<Partial<FormMetadataDocument>>[]>} */ (coll.aggregate(pipeline, aggOptions).toArray()),
      coll.countDocuments(
        buildFilterConditions({
          title,
          author,
          organisations,
          status
        })
      )
    ])

    return { documents, totalItems, filters }
  } catch (err) {
    logger.error(err, `[fetchDocuments] Error fetching documents - ${getErrorMessage(err)}`)
    throw err
  }
}

/**
 * Retrieves the list of documents from the database with pagination, sorting, and versions.
 * @param {QueryOptions} options - Pagination, sorting, and filtering options.
 * @returns {Promise<{ documents: WithId<Partial<FormMetadataDocument>>[], totalItems: number, filters: FilterOptions }>}
 */
export async function listWithVersions(options) {
  try {
    const {
      page,
      perPage,
      sortBy = 'updatedAt',
      order = 'desc',
      title = '',
      author = '',
      organisations = [],
      status = []
    } = options

    const coll = /** @type {Collection<Partial<FormMetadataDocument>>} */ (db.collection(METADATA_COLLECTION_NAME))

    const skip = (page - 1) * perPage

    const [filterResults] = /** @type {[FilterAggregationResult]} */ (
      await coll.aggregate([buildFiltersFacet()]).toArray()
    )

    const filters = processFilterResults(filterResults)

    const { pipeline, aggOptions } = buildAggregationPipelineWithVersions(
      sortBy,
      order,
      title,
      author,
      organisations,
      status
    )

    pipeline.push({ $skip: skip }, { $limit: perPage })

    const [documents, totalItems] = await Promise.all([
      /** @type {Promise<WithId<Partial<FormMetadataDocument>>[]>} */ (coll.aggregate(pipeline, aggOptions).toArray()),
      coll.countDocuments(
        buildFilterConditions({
          title,
          author,
          organisations,
          status
        })
      )
    ])

    return { documents, totalItems, filters }
  } catch (err) {
    logger.error(err, `[fetchDocumentsWithVersions] Error fetching documents with versions - ${getErrorMessage(err)}`)
    throw err
  }
}

/**
 * Retrieves a form metadata by ID
 * @param {string} formId - ID of the form
 * @param {ClientSession} [session] - Optional MongoDB session for transactions
 */
export async function get(formId, session) {
  logger.info(`Getting form with ID ${formId}`)

  const coll = /** @satisfies {Collection<Partial<FormMetadataDocument>>} */ (db.collection(METADATA_COLLECTION_NAME))

  try {
    const document = await coll.findOne({ _id: new ObjectId(formId) }, { session })

    if (!document) {
      throw Boom.notFound(`Form with ID '${formId}' not found`)
    }

    logger.info(`Form with ID ${formId} found`)

    return document
  } catch (err) {
    logger.error(err, `[getFormById] Getting form with ID ${formId} failed - ${getErrorMessage(err)}`)

    if (Boom.isBoom(err)) {
      throw err
    }

    if (err instanceof Error) {
      throw Boom.badRequest(err)
    }
    throw err
  }
}

/**
 * Retrieves a form metadata by slug
 * @param {string} slug - The slug of the form
 * @param {ClientSession} [session]
 */
export async function getBySlug(slug, session) {
  logger.info(`Getting form with slug ${slug}`)

  const coll = /** @satisfies {Collection<FormMetadataDocument>} */ (db.collection(METADATA_COLLECTION_NAME))

  try {
    const document = await coll.findOne({ slug }, { session })

    if (!document) {
      throw Boom.notFound(`Form with slug '${slug}' not found`)
    }

    logger.info(`Form with slug ${slug} found`)

    return document
  } catch (err) {
    logger.error(err, `[getFormBySlug] Getting form with slug ${slug} failed - ${getErrorMessage(err)}`)

    if (err instanceof Error && !Boom.isBoom(err)) {
      throw Boom.internal(err)
    }

    throw err
  }
}

/**
 * Create a document in the database
 * @param {FormMetadataDocument} document - form metadata document
 * @param {ClientSession} session - mongo transaction session
 */
export async function create(document, session) {
  logger.info(`Creating form with slug ${document.slug}`)

  const coll = /** @satisfies {Collection<FormMetadataDocument>} */ (db.collection(METADATA_COLLECTION_NAME))

  try {
    const result = await coll.insertOne(document, { session })
    const formId = result.insertedId.toString()

    logger.info(`Form with slug ${document.slug} created as form ID ${formId}`)

    return result
  } catch (err) {
    const message = `Creating form with slug ${document.slug} failed`

    if (err instanceof MongoServerError && err.code === MongoError.DuplicateKey) {
      const error = new FormAlreadyExistsError(document.slug, { cause: err })

      logger.info(err, `[duplicateFormSlug] Creating form with slug ${document.slug} failed - form already exists`)
      throw Boom.badRequest(error)
    }

    if (err instanceof MongoServerError) {
      logger.error(err, `[mongoError] ${message} - MongoDB error code: ${err.code} - ${err.message}`)
    } else {
      logger.error(err, `[updateError] ${message} - ${getErrorMessage(err)}`)
    }
    throw err
  }
}

/**
 * Update a document in the database
 * @param {string} formId - ID of the form
 * @param {UpdateFilter<PartialFormMetadataDocument>} update - form metadata document update filter
 * @param {ClientSession} [session] - mongo transaction session
 */
export async function update(formId, update, session) {
  logger.info(`Updating form with ID ${formId}`)

  const coll = /** @satisfies {Collection<PartialFormMetadataDocument>} */ (db.collection(METADATA_COLLECTION_NAME))

  try {
    const result = await coll.updateOne({ _id: new ObjectId(formId) }, update, {
      session
    })

    // Throw if updated record count is not 1
    if (result.modifiedCount !== 1) {
      throw Boom.badRequest(`Form with ID ${formId} not updated. Modified count ${result.modifiedCount}`)
    }

    logger.info(`Form with ID ${formId} updated`)

    const metadata = await coll.findOne({ _id: new ObjectId(formId) }, { session })

    if (!metadata) {
      throw Boom.badRequest(`Form with ID ${formId} not found.`)
    }

    return metadata
  } catch (err) {
    logger.error(err, `[updateFormMetadata] Updating form with ID ${formId} failed - ${getErrorMessage(err)}`)

    if (err instanceof Error && !Boom.isBoom(err)) {
      throw Boom.internal(err)
    }

    throw err
  }
}

/**
 * Insert or update a whole document in the database
 * @param {FormMetadata} document - form metadata document update filter
 * @param {ClientSession} [session] - mongo transaction session
 */
export async function upsert(document, session) {
  const coll = /** @satisfies {Collection<PartialFormMetadataDocument>} */ (db.collection(METADATA_COLLECTION_NAME))

  try {
    const result = await coll.updateOne(
      { _id: new ObjectId(document.id) },
      { $set: document },
      { session, upsert: true }
    )

    return result
  } catch (err) {
    logger.error(err, `[upsertFormMetadata] Updating form with ID ${document.id} failed - ${getErrorMessage(err)}`)

    if (err instanceof Error && !Boom.isBoom(err)) {
      throw Boom.internal(err)
    }

    throw err
  }
}

/**
 * @param {string} formId - ID of the form
 * @param {FormMetadataAuthor} author
 * @param {ClientSession} session - mongo transaction session
 * @param {Date} [date] - defaults to new Date()
 */
export async function updateAudit(formId, author, session, date = new Date()) {
  logger.info(`Updating audit fields for form with ID ${formId}`)

  const result = await update(formId, { $set: partialAuditFields(date, author) }, session)

  logger.info(`Updated audit fields for form with ID ${formId}`)

  return result
}

/**
 * Removes a form metadata
 * @param {string} formId - ID of the form
 * @param {ClientSession} session
 */
export async function remove(formId, session) {
  logger.info(`Removing form metadata with ID ${formId}`)

  await removeById(session, METADATA_COLLECTION_NAME, formId)

  logger.info(`Removed form metadata with ID ${formId}`)
}

/**
 * Adds version metadata to a form
 * @param {string} formId - ID of the form
 * @param {FormVersionMetadata} versionMetadata - Version metadata to add
 * @param {ClientSession} session - mongo transaction session
 */
export async function addVersionMetadata(formId, versionMetadata, session) {
  logger.info(`Adding version metadata ${versionMetadata.versionNumber} to form ID ${formId}`)

  const result = await update(
    formId,
    {
      $push: {
        versions: {
          $each: [versionMetadata],
          $sort: { versionNumber: -1 }
        }
      }
    },
    session
  )

  logger.info(`Added version metadata ${versionMetadata.versionNumber} to form ID ${formId}`)

  return result
}

/**
 * Gets version metadata for a form
 * @param {string} formId - ID of the form
 * @param {ClientSession} [session] - Optional MongoDB session for transactions
 * @returns {Promise<FormVersionMetadata[]>}
 */
export async function getVersionMetadata(formId, session) {
  logger.info(`Getting version metadata for form ID ${formId}`)

  const metadata = await get(formId, session)
  const versions = metadata.versions ?? []

  logger.info(`Found ${versions.length} versions for form ID ${formId}`)

  return versions
}

/**
 * Atomically increments and returns the next version number for a form
 * @param {string} formId - ID of the form
 * @param {ClientSession} session - MongoDB session for transactions
 * @returns {Promise<number>} The next version number
 */
export async function getAndIncrementVersionNumber(formId, session) {
  logger.info(`Getting and incrementing version number for form ID ${formId}`)

  const coll = /** @type {Collection<FormMetadataDocument>} */ (db.collection(METADATA_COLLECTION_NAME))

  // 1. Calculate the max version from the versions array
  // 2. Compare with lastVersionNumber
  // 3. Set lastVersionNumber to the max + 1
  const result = await coll.findOneAndUpdate(
    { _id: new ObjectId(formId) },
    {
      $inc: { lastVersionNumber: 1 }
    },
    {
      returnDocument: 'after',
      session,
      projection: { lastVersionNumber: 1 }
    }
  )

  if (!result) {
    throw Boom.notFound(`Form with ID ${formId} not found`)
  }

  // @ts-expect-error - lastVersionNumber is added dynamically
  const nextVersionNumber = result.lastVersionNumber

  logger.info(`Next version number for form ID ${formId} is ${nextVersionNumber}`)

  return nextVersionNumber
}

/**
 * @import { FormMetadata, FormMetadataDocument, QueryOptions, FilterOptions, FormMetadataAuthor, FormVersionMetadata } from '@defra/forms-model'
 * @import { ClientSession, Collection, UpdateFilter, WithId } from 'mongodb'
 * @import { PartialFormMetadataDocument,  } from '~/src/api/types.js'
 * @import { FilterAggregationResult } from '~/src/api/forms/repositories/aggregation/types.js'
 */
