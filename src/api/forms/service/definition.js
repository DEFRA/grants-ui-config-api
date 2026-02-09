import { Engine, FormDefinitionRequestType, FormStatus, getErrorMessage } from '@defra/forms-model'
import Boom from '@hapi/boom'

import { makeFormLiveErrorMessages } from '~/src/api/forms/constants.js'
import * as formDefinition from '~/src/api/forms/repositories/form-definition-repository.js'
import { deleteDraft } from '~/src/api/forms/repositories/form-definition-repository.js'
import * as formMetadata from '~/src/api/forms/repositories/form-metadata-repository.js'
import { getValidationSchema } from '~/src/api/forms/service/helpers/definition.js'
import { getForm } from '~/src/api/forms/service/index.js'
import { logger, mapForm, partialAuditFields } from '~/src/api/forms/service/shared.js'
import { createFormVersion } from '~/src/api/forms/service/versioning.js'
import {
  publishDraftCreatedFromLiveEvent,
  publishFormDraftDeletedEvent,
  publishFormDraftReplacedEvent,
  publishFormUpdatedEvent,
  publishLiveCreatedFromDraftEvent
} from '~/src/messaging/publish.js'
import { client } from '~/src/mongo.js'

/**
 * Retrieves a paginated list of forms with filter options
 * @param {QueryOptions} options - Pagination, sorting, and filtering options
 * @returns {Promise<{ forms: FormMetadata[], totalItems: number, filters: FilterOptions }>}
 */
export async function listForms(options) {
  const { documents, totalItems, filters } = await formMetadata.list(options)
  const forms = documents.map(mapForm)

  return { forms, totalItems, filters }
}

/**
 * Retrieves the form definition content for a given form ID
 * @param {string} formId - the ID of the form
 * @param {FormStatus} state - the form state
 * @param {ClientSession | undefined} [session]
 */
// eslint-disable-next-line @typescript-eslint/no-useless-default-assignment
export async function getFormDefinition(formId, state = FormStatus.Draft, session = undefined) {
  return formDefinition.get(formId, state, session)
}

/**
 * @param {string} formId - ID of the form
 * @param {FormDefinition} definition - full form definition
 * @param {FormMetadataAuthor} author - the author details
 */
export async function updateDraftFormDefinition(formId, definition, author) {
  logger.info(`Updating form definition (draft) for form ID ${formId}`)

  try {
    // Get the form metadata from the db
    const form = await getForm(formId)

    if (!form.draft) {
      throw Boom.badRequest(`Form with ID '${formId}' has no draft state`)
    }

    // some definition attributes shouldn't be customised by users, so patch
    // them on every write to prevent imported forms drifting (e.g. JSON upload)
    definition.name = form.title

    const schema = getValidationSchema(definition)

    const session = client.startSession()

    try {
      await session.withTransaction(async () => {
        logger.info(`Updating form definition (draft) for form ID ${formId}`)

        await formDefinition.update(formId, definition, session, schema)
        const updatedMetadata = await formMetadata.updateAudit(formId, author, session)

        await createFormVersion(formId, session)

        // Publish audit message
        await publishFormDraftReplacedEvent(updatedMetadata, definition)
      })
    } finally {
      await session.endSession()
    }

    logger.info(`Updated form metadata (draft) for form ID ${formId}`)
  } catch (err) {
    logger.error(
      err,
      `[updateFormDefinition] Updating form definition (draft) for form ID ${formId} failed - ${getErrorMessage(err)}`
    )

    throw err
  }
}

/**
 * Delete the draft definition but leave the live definition as is
 * @param {string} formId - ID of the form
 * @param {FormMetadataAuthor} author - the author details
 */
export async function deleteDraftFormDefinition(formId, author) {
  logger.info(`Deleting form definition (draft) for form ID ${formId}`)

  try {
    // Get the form metadata from the db
    const form = await getForm(formId)

    if (!form.draft) {
      throw Boom.badRequest(`Form with ID '${formId}' has no draft state`)
    }

    if (!form.live) {
      throw Boom.badRequest(`Form with ID '${formId}' has no live state`)
    }

    const session = client.startSession()

    try {
      await session.withTransaction(async () => {
        logger.info(`Deleting form definition (draft) for form ID ${formId}`)

        await deleteDraft(form.id, session)

        const updatedMeta = {
          ...form,
          updatedAt: new Date(),
          updatedBy: author
        }
        delete updatedMeta.draft

        await formMetadata.update(formId, { $set: updatedMeta, $unset: { draft: '' } }, session)

        // Publish audit message
        await publishFormDraftDeletedEvent(updatedMeta, author)
      })
    } finally {
      await session.endSession()
    }

    logger.info(`Updated form metadata (draft) for form ID ${formId}`)
  } catch (err) {
    logger.error(
      err,
      `[updateFormDefinition] Updating form definition (draft) for form ID ${formId} failed - ${getErrorMessage(err)}`
    )

    throw err
  }
}

/**
 * Validates form and form definition for publishing to live
 * @param {string} formId - ID of the form
 * @param {FormMetadata} form - Form metadata
 * @param {FormDefinition} draftFormDefinition - Draft form definition
 */
function validateFormForPublishing(formId, form, draftFormDefinition) {
  if (!form.draft) {
    logger.info(
      `[noDraftState] Form with ID '${formId}' has no draft state so failed deployment to live - validation failed`
    )
    throw Boom.badRequest(makeFormLiveErrorMessages.missingDraft)
  }

  if (!form.contact) {
    throw Boom.badRequest(makeFormLiveErrorMessages.missingContact)
  }

  if (!form.submissionGuidance) {
    throw Boom.badRequest(makeFormLiveErrorMessages.missingSubmissionGuidance)
  }

  if (!form.privacyNoticeUrl) {
    logger.info(`[missingPrivacyNotice] Form ${formId} missing privacy notice URL - validation failed, cannot publish`)
    throw Boom.badRequest(makeFormLiveErrorMessages.missingPrivacyNotice)
  }

  if (draftFormDefinition.engine !== Engine.V2 && !draftFormDefinition.startPage) {
    throw Boom.badRequest(makeFormLiveErrorMessages.missingStartPage)
  }

  if (!form.notificationEmail) {
    throw Boom.badRequest(makeFormLiveErrorMessages.missingOutputEmail)
  }
}

/**
 * Creates the live form from the current draft state
 * @param {string} formId - ID of the form
 * @param {FormMetadataAuthor} author - the author of the new live state
 */
export async function createLiveFromDraft(formId, author) {
  logger.info(`Make draft live for form ID ${formId}`)

  try {
    // Get the form metadata and draft definition
    const form = await getForm(formId)
    const draftFormDefinition = await formDefinition.get(formId, FormStatus.Draft)

    // Validate form can be published
    validateFormForPublishing(formId, form, draftFormDefinition)

    // Build the live state
    const now = new Date()
    const set = !form.live
      ? {
          // Initialise the live state
          live: {
            updatedAt: now,
            updatedBy: author,
            createdAt: now,
            createdBy: author
          },
          updatedAt: now,
          updatedBy: author
        }
      : partialAuditFields(now, author, FormStatus.Live) // Partially update the live state fields

    const session = client.startSession()

    try {
      await session.withTransaction(async () => {
        // Copy the draft form definition
        await formDefinition.createLiveFromDraft(formId, session)

        logger.info(`Removing form metadata (draft) for form ID ${formId}`)

        // Update the form with the live state and clear the draft
        await formMetadata.update(
          formId,
          {
            $set: set,
            $unset: { draft: '' }
          },
          session
        )

        await createFormVersion(formId, session)

        // Publish audit message
        await publishLiveCreatedFromDraftEvent(formId, now, author)
      })
    } finally {
      await session.endSession()
    }

    logger.info(`Removed form metadata (draft) for form ID ${formId}`)
    logger.info(`Made draft live for form ID ${formId}`)
  } catch (err) {
    logger.error(err, `[makeDraftLive] Make draft live for form ID ${formId} failed - ${getErrorMessage(err)}`)

    throw err
  }
}

/**
 * Recreates the draft form from the current live state
 * @param {string} formId - ID of the form
 * @param {FormMetadataAuthor} author - the author of the new draft
 */
export async function createDraftFromLive(formId, author) {
  logger.info(`Create draft to edit for form ID ${formId}`)

  try {
    // Get the form metadata from the db
    const form = await getForm(formId)

    if (!form.live) {
      throw Boom.badRequest(`Form with ID '${formId}' has no live state`)
    }

    // Build the draft state
    const now = new Date()
    const set = {
      draft: {
        updatedAt: now,
        updatedBy: author,
        createdAt: now,
        createdBy: author
      },
      updatedAt: now,
      updatedBy: author
    }

    const session = client.startSession()

    try {
      await session.withTransaction(async () => {
        // Copy the draft form definition
        await formDefinition.createDraftFromLive(formId, session)

        logger.info(`Adding form metadata (draft) for form ID ${formId}`)

        await formMetadata.update(formId, { $set: set }, session)

        await createFormVersion(formId, session)

        // Publish audit message
        await publishDraftCreatedFromLiveEvent(formId, now, author)
      })
    } finally {
      await session.endSession()
    }

    logger.info(`Added form metadata (draft) for form ID ${formId}`)
    logger.info(`Created draft to edit for form ID ${formId}`)
  } catch (err) {
    logger.error(
      err,
      `[createDraftFromLive] Create draft to edit for form ID ${formId} failed - ${getErrorMessage(err)}`
    )

    throw err
  }
}

/**
 * Based on a list of Page ids will reorder the pages
 * @param {string} formId
 * @param {string[]} order
 * @param {FormMetadataAuthor} author
 */
export async function reorderDraftFormDefinitionPages(formId, order, author) {
  logger.info(`Reordering pages on Form Definition (draft) for form ID ${formId}`)

  const form = await getFormDefinition(formId)

  if (!order.length) {
    return form
  }

  const session = client.startSession()

  try {
    const newForm = await session.withTransaction(async () => {
      const reorderedForm = await formDefinition.reorderPages(formId, order, session)

      const metadataDocument = await formMetadata.updateAudit(formId, author, session)

      await createFormVersion(formId, session)

      await publishFormUpdatedEvent(metadataDocument, { pageOrder: order }, FormDefinitionRequestType.REORDER_PAGES)

      return reorderedForm
    })

    logger.info(`Reordered pages on Form Definition (draft) for form ID ${formId}`)

    return newForm
  } catch (err) {
    logger.error(
      err,
      `[reorderPages] Reordering pages on form definition (draft) for form ID ${formId} failed - ${getErrorMessage(err)}`
    )

    throw err
  } finally {
    await session.endSession()
  }
}

/**
 * Based on a list of component ids will reorder the components on a page
 * @param {string} formId
 * @param {string} pageId
 * @param {string[]} order
 * @param {FormMetadataAuthor} author
 */
export async function reorderDraftFormDefinitionComponents(formId, pageId, order, author) {
  logger.info(`Reordering components on Form Definition (draft) for form ID ${formId} pageID ${pageId}`)

  const form = await getFormDefinition(formId)

  if (!order.length) {
    return form
  }

  const session = client.startSession()

  try {
    const newForm = await session.withTransaction(async () => {
      const reorderedForm = await formDefinition.reorderComponents(formId, pageId, order, session)

      const metadataDocument = await formMetadata.updateAudit(formId, author, session)

      await createFormVersion(formId, session)

      await publishFormUpdatedEvent(
        metadataDocument,
        { pageId, componentOrder: order },
        FormDefinitionRequestType.REORDER_COMPONENTS
      )

      return reorderedForm
    })

    logger.info(`Reordered components on Form Definition (draft) for form ID ${formId} pageID ${pageId}`)

    return newForm
  } catch (err) {
    logger.error(
      err,
      `[reorderComponents] Reordering components on form definition (draft) for form ID ${formId} pageID ${pageId} failed - ${getErrorMessage(err)}`
    )

    throw err
  } finally {
    await session.endSession()
  }
}

/**
 * @import { FormDefinition, FormMetadataAuthor, FormMetadata, FilterOptions, QueryOptions } from '@defra/forms-model'
 * @import { ClientSession } from 'mongodb'
 */
