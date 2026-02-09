import { FormStatus } from '@defra/forms-model'
import { ObjectId } from 'mongodb'

import { createLogger } from '~/src/helpers/logging/logger.js'

export const logger = createLogger()
export const defaultAuthor = {
  displayName: 'Unknown',
  id: '-1'
}
export const defaultDate = new Date('2024-06-25T23:00:00Z') // date we went live

/**
 * Partially update the [state] fields
 * @param {Date} date
 * @param {FormMetadataAuthor} author
 * @param {FormStatus} state
 * @returns {PartialFormMetadataDocument}
 */
export function partialAuditFields(date, author, state = FormStatus.Draft) {
  return /** @type {PartialFormMetadataDocument} */ {
    [`${state}.updatedAt`]: date,
    [`${state}.updatedBy`]: author,
    updatedAt: date,
    updatedBy: author
  }
}

export const SUMMARY_PAGE_ID = '449a45f6-4541-4a46-91bd-8b8931b07b50'

export const MongoError = {
  DuplicateKey: 11000
}

/**
 * Maps a form metadata document from MongoDB to form metadata
 * @param {WithId<Partial<FormMetadataDocument>>} document - form metadata document (with ID)
 * @returns {FormMetadata}
 */
export function mapForm(document) {
  if (!document.slug || !document.title || !document.organisation || !document.teamName || !document.teamEmail) {
    throw Error('Form is malformed in the database. Expected fields are missing.')
  }

  const lastUpdated = getLastUpdated(document)
  const created = getCreated(document)

  // 'draft' or 'live' should be omitted from the object if they dont have content
  const draft = document.draft ? { draft: document.draft } : {}
  const live = document.live ? { live: document.live } : {}

  return {
    id: document._id.toString(),
    slug: document.slug,
    title: document.title,
    organisation: document.organisation,
    teamName: document.teamName,
    teamEmail: document.teamEmail,
    contact: document.contact,
    submissionGuidance: document.submissionGuidance,
    privacyNoticeUrl: document.privacyNoticeUrl,
    notificationEmail: document.notificationEmail,
    ...draft,
    ...live,
    createdBy: created.createdBy,
    createdAt: created.createdAt,
    updatedBy: lastUpdated.updatedBy,
    updatedAt: lastUpdated.updatedAt,
    versions: document.versions ?? [{ versionNumber: 1, createdAt: lastUpdated.updatedAt }]
  }
}

/**
 * @param {Partial<FormMetadataDocument>} document - form metadata document
 * @returns {{ updatedAt: Date, updatedBy: FormMetadataAuthor }}
 */
export function getLastUpdated(document) {
  if (document.updatedAt && document.updatedBy) {
    return { updatedAt: document.updatedAt, updatedBy: document.updatedBy }
  } else if (document.draft) {
    // draft is newer than live, handle it first
    return document.draft
  } else if (document.live) {
    return document.live
  } else {
    return { updatedAt: defaultDate, updatedBy: defaultAuthor }
  }
}

/**
 * @import { FormMetadataAuthor } from '@defra/forms-model'
 * @import { PartialFormMetadataDocument } from '~/src/api/types.js'
 */
/**
 * @param {Partial<FormMetadataDocument>} document - form metadata document
 * @returns {{ createdAt: Date, createdBy: FormMetadataAuthor }}
 */
export function getCreated(document) {
  if (document.createdAt && document.createdBy) {
    return { createdAt: document.createdAt, createdBy: document.createdBy }
  } else if (document.live) {
    // live is older than draft, handle it first
    return document.live
  } else if (document.draft) {
    return document.draft
  } else {
    return { createdAt: defaultDate, createdBy: defaultAuthor }
  }
}

/**
 * Maps a form metadata document from MongoDB to form metadata
 * @param {FormMetadata} document - form metadata document (with ID)
 * @returns {WithId<Partial<FormMetadataDocument>>}
 */
export function mapToDocument(document) {
  return {
    ...document,
    _id: new ObjectId(document.id)
  }
}

/**
 * @import { FormMetadataDocument, FormMetadata } from '@defra/forms-model'
 * @import { WithId } from 'mongodb'
 */
