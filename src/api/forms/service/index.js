import { FormStatus, formDefinitionV2Schema, getErrorMessage, slugify } from '@defra/forms-model'
import Boom from '@hapi/boom'
import { MongoServerError } from 'mongodb'

import { removeFormErrorMessages } from '~/src/api/forms/constants.js'
import * as formDefinition from '~/src/api/forms/repositories/form-definition-repository.js'
import * as formMetadata from '~/src/api/forms/repositories/form-metadata-repository.js'
import * as formVersions from '~/src/api/forms/repositories/form-versions-repository.js'
import { getValidationSchema, validate } from '~/src/api/forms/service/helpers/definition.js'
import { MongoError, logger, mapForm, partialAuditFields } from '~/src/api/forms/service/shared.js'
import { createFormVersion, removeFormVersions } from '~/src/api/forms/service/versioning.js'
import * as formTemplates from '~/src/api/forms/templates.js'
import { getFormMetadataAuditMessages } from '~/src/messaging/mappers/form-events-bulk.js'
import {
  bulkPublishEvents,
  publishFormCreatedEvent,
  publishFormDraftDeletedEvent,
  publishFormTitleUpdatedEvent
} from '~/src/messaging/publish.js'
import { client } from '~/src/mongo.js'

/**
 * Validates that a live form title cannot be updated
 * @param {FormMetadata} form - The form metadata
 * @param {string} formId - The form ID
 * @param {Partial<FormMetadataInput>} formUpdate - The update payload
 */
export function validateLiveFormTitleUpdate(form, formId, formUpdate) {
  if (form.live && 'title' in formUpdate) {
    throw Boom.badRequest(`Form with ID '${formId}' is live so 'title' cannot be updated`)
  }
}

/**
 * Prepares the updated form metadata with audit fields
 * @param {Partial<FormMetadataInput>} formUpdate - The update payload
 * @param {FormMetadataAuthor} author - The author details
 * @returns {PartialFormMetadataDocument}
 */
export function prepareUpdatedFormMetadata(formUpdate, author) {
  const now = new Date()
  const { updatedAt, updatedBy, ...draftAuditFields } = partialAuditFields(now, author)

  let updatedForm = {
    ...formUpdate,
    updatedAt,
    updatedBy
  }

  if (formUpdate.title) {
    updatedForm = {
      ...updatedForm,
      slug: slugify(formUpdate.title),
      ...draftAuditFields
    }
  }

  return updatedForm
}

/**
 * Handles title update logic including definition sync and versioning
 * @param {string} formId - The form ID
 * @param {FormMetadata} form - The original form metadata
 * @param {Partial<FormMetadataInput>} formUpdate - The update payload
 * @param {PartialFormMetadataDocument} updatedForm - The prepared update
 * @param {ClientSession} session - MongoDB session
 */
export async function handleTitleUpdate(formId, form, formUpdate, updatedForm, session) {
  if (!formUpdate.title) {
    throw new Error('Title is required for title update')
  }

  const definition = await formDefinition.get(formId, FormStatus.Draft, session)
  const schema = getValidationSchema(definition)

  await formDefinition.updateName(formId, formUpdate.title, session, schema)

  await createFormVersion(formId, session)

  await publishFormTitleUpdatedEvent({ ...form, ...updatedForm }, form)
}

/**
 * Handles versioning for non-title metadata updates
 * @param {string} formId - The form ID
 * @param {Partial<FormMetadataInput>} formUpdate - The update payload
 * @param {ClientSession} session - MongoDB session
 */
export async function handleMetadataVersioning(formId, formUpdate, session) {
  if (Object.keys(formUpdate).length > 0) {
    await createFormVersion(formId, session)
  } else {
    logger.debug(`No metadata changes to process for form ID ${formId}`)
  }
}

/**
 * Creates a new empty form
 * @param {FormMetadataInput} metadataInput - the form metadata to save
 * @param {FormMetadataAuthor} author - the author details
 */
export async function createForm(metadataInput, author) {
  const { title } = metadataInput

  // Create a blank form definition with the title set
  const definition = { ...formTemplates.emptyV2(), name: title }

  // Validate the form definition
  validate(definition, formDefinitionV2Schema)

  // Create the slug
  const slug = slugify(title)
  const now = new Date()

  /**
   * Create the metadata document
   * @satisfies {FormMetadataDocument}
   */
  const document = {
    ...metadataInput,
    slug,
    draft: {
      createdAt: now,
      createdBy: author,
      updatedAt: now,
      updatedBy: author
    },
    createdAt: now,
    createdBy: author,
    updatedAt: now,
    updatedBy: author,
    versions: []
  }

  const session = client.startSession()

  /** @type {FormMetadata | undefined} */
  let metadata

  try {
    await session.withTransaction(async () => {
      // Create the metadata document
      const { insertedId: _id } = await formMetadata.create(document, session)
      metadata = mapForm({ ...document, _id })

      // Create the draft form definition
      // prettier-ignore
      await formDefinition.insert(metadata.id, definition, session, formDefinitionV2Schema)

      // Create the first version of the form
      await createFormVersion(metadata.id, session)

      await publishFormCreatedEvent(metadata)
    })
  } finally {
    await session.endSession()
  }

  if (!metadata) {
    throw Boom.badRequest('No metadata created in the transaction')
  }

  return metadata
}

/**
 * Retrieves form metadata by ID
 * @param {string} formId - ID of the form
 */
export async function getForm(formId) {
  const document = await formMetadata.get(formId)

  const versions = await formVersions.getVersionSummaries(formId)

  const documentWithVersions = { ...document, versions }

  return mapForm(documentWithVersions)
}

/**
 * Retrieves form metadata by slug
 * @param {string} slug - The slug of the form
 */
export async function getFormBySlug(slug) {
  const document = await formMetadata.getBySlug(slug)

  const formId = document._id.toString()
  const versions = await formVersions.getVersionSummaries(formId)

  const documentWithVersions = { ...document, versions }

  return mapForm(documentWithVersions)
}

/**
 * Updates the form metadata.
 * Note: If the 'title' is updated, this method also updates the form definition's 'name' to keep them in sync.
 * @param {string} formId - ID of the form
 * @param {Partial<FormMetadataInput>} formUpdate - full form definition
 * @param {FormMetadataAuthor} author - the author details
 * @returns {Promise<string>}
 */
export async function updateFormMetadata(formId, formUpdate, author) {
  logger.info(`Updating form metadata for form ID ${formId}`)

  try {
    const form = await getForm(formId)
    validateLiveFormTitleUpdate(form, formId, formUpdate)

    const updatedForm = prepareUpdatedFormMetadata(formUpdate, author)
    const session = client.startSession()

    await session.withTransaction(async () => {
      await formMetadata.update(formId, { $set: updatedForm }, session)

      if (formUpdate.title) {
        await handleTitleUpdate(formId, form, formUpdate, updatedForm, session)
      } else {
        await handleMetadataVersioning(formId, formUpdate, session)
      }

      const auditMessages = getFormMetadataAuditMessages(form, updatedForm)
      if (auditMessages.length) {
        await bulkPublishEvents(auditMessages)
      }
    })

    logger.info(`Updated form metadata for form ID ${formId}`)
    return updatedForm.slug ?? form.slug
  } catch (err) {
    if (err instanceof MongoServerError && err.code === MongoError.DuplicateKey) {
      logger.info(`[duplicateFormTitle] Form title ${formUpdate.title} already exists - validation failed`)
      throw Boom.badRequest(`Form title ${formUpdate.title} already exists`)
    }
    logger.error(
      err,
      `[updateFormMetadata] Updating form metadata for form ID ${formId} failed - ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * Removes a form (metadata and definition)
 * @param {string} formId
 * @param {FormMetadataAuthor} author
 */
export async function removeForm(formId, author) {
  logger.info(`Removing form with ID ${formId}`)

  const form = await getForm(formId)

  if (form.live) {
    throw Boom.badRequest(removeFormErrorMessages.formIsAlreadyLive)
  }

  const session = client.startSession()

  try {
    await session.withTransaction(async () => {
      await formMetadata.remove(formId, session)
      await formDefinition.remove(formId, session)
      await removeFormVersions(formId, session)
      await publishFormDraftDeletedEvent(form, author)
    })
  } finally {
    await session.endSession()
  }

  logger.info(`Removed form with ID ${formId}`)
}

/**
 * @import { FormMetadataAuthor, FormMetadataDocument, FormMetadataInput, FormMetadata } from '@defra/forms-model'
 * @import { PartialFormMetadataDocument } from '~/src/api/types.js'
 * @import { ClientSession } from 'mongodb'
 */
