import { FormDefinitionRequestType, messageSchema } from '@defra/forms-model'
import Joi from 'joi'

import { mapForm } from '~/src/api/forms/service/shared.js'
import {
  formCreatedEventMapper,
  formDraftCreatedFromLiveMapper,
  formDraftDeletedMapper,
  formLiveCreatedFromDraftMapper,
  formMigratedMapper,
  formTitleUpdatedMapper,
  formUpdatedMapper
} from '~/src/messaging/mappers/form-events.js'
import { publishEvent } from '~/src/messaging/publish-base.js'
import { saveToS3 } from '~/src/messaging/s3.js'

/**
 * Helper to validate and publish an event
 * @param {AuditMessage} auditMessage
 */
async function validateAndPublishEvent(auditMessage) {
  const value = Joi.attempt(auditMessage, messageSchema, {
    abortEarly: false
  })

  return publishEvent(value)
}

/**
 * Publish form created event
 * @param {FormMetadata} metadata
 */
export async function publishFormCreatedEvent(metadata) {
  const auditMessage = formCreatedEventMapper(metadata)

  return validateAndPublishEvent(auditMessage)
}

/**
 * Publishes a form title updated event
 * @param {FormMetadata} metadata
 * @param {FormMetadata} oldMetadata
 */
export async function publishFormTitleUpdatedEvent(metadata, oldMetadata) {
  const auditMessage = formTitleUpdatedMapper(metadata, oldMetadata)

  return validateAndPublishEvent(auditMessage)
}

/**
 * Publishes a live created from draft event
 * @param {string} formId
 * @param {Date} createdAt
 * @param {AuditUser} createdBy
 */
export async function publishLiveCreatedFromDraftEvent(formId, createdAt, createdBy) {
  const auditMessage = formLiveCreatedFromDraftMapper(formId, createdAt, createdBy)

  return validateAndPublishEvent(auditMessage)
}

/**
 * Publishes a draft created from live event
 * @param {string} formId
 * @param {Date} createdAt
 * @param {AuditUser} createdBy
 */
export async function publishDraftCreatedFromLiveEvent(formId, createdAt, createdBy) {
  const auditMessage = formDraftCreatedFromLiveMapper(formId, createdAt, createdBy)

  return validateAndPublishEvent(auditMessage)
}

/**
 * Publishes a form migrated event
 * @param {string} formId
 * @param {Date} createdAt
 * @param {AuditUser} createdBy
 */
export async function publishFormMigratedEvent(formId, createdAt, createdBy) {
  const auditMessage = formMigratedMapper(formId, createdAt, createdBy)

  return validateAndPublishEvent(auditMessage)
}

/**
 * @param {AuditMessage[]} messages
 * @returns {Promise<{ messageId?: string; type: AuditEventMessageType }[]>}
 */
export async function bulkPublishEvents(messages) {
  const messagePromises = messages.map((message) => validateAndPublishEvent(message))

  const publishResults = await Promise.all(messagePromises)

  return publishResults.map((publishResult, idx) => {
    const type = messages[idx].type
    return {
      type,
      messageId: publishResult?.MessageId
    }
  })
}

/**
 * @param {FormMetadata} metadata
 * @param {AuditUser} author
 */
export async function publishFormDraftDeletedEvent(metadata, author) {
  const auditMessage = formDraftDeletedMapper(metadata, author)

  return validateAndPublishEvent(auditMessage)
}

/**
 *
 * @param {WithId<Partial<FormMetadataDocument & { 'draft.updatedAt': Date; 'draft.updatedBy': FormMetadataAuthor; }>>} metadataDocument
 * @param {unknown} payload
 * @param {FormDefinitionRequestType} requestType
 * @param {FormDefinitionS3Meta} [s3Meta]
 */
export async function publishFormUpdatedEvent(metadataDocument, payload, requestType, s3Meta) {
  const metadata = mapForm(metadataDocument)
  const auditMessage = formUpdatedMapper(metadata, requestType, s3Meta === undefined ? { payload } : { s3Meta })

  return validateAndPublishEvent(auditMessage)
}

/**
 *
 * @param {WithId<Partial<FormMetadataDocument & { 'draft.updatedAt': Date; 'draft.updatedBy': FormMetadataAuthor; }>>} metadataDocument
 * @param {FormDefinition} definition
 */
export async function publishFormDraftReplacedEvent(metadataDocument, definition) {
  const metadata = mapForm(metadataDocument)
  const filename = `${metadata.id}.json`
  const s3Meta = await saveToS3(filename, definition)

  const auditMessage = formUpdatedMapper(metadata, FormDefinitionRequestType.REPLACE_DRAFT, {
    s3Meta
  })

  return validateAndPublishEvent(auditMessage)
}

/**
 * @import { FormDefinition, FormMetadataAuthor, FormMetadataDocument, AuditEventMessageType, FormMetadata, AuditMessage, AuditUser, FormDefinitionS3Meta } from '@defra/forms-model'
 * @import { WithId } from 'mongodb'
 */
