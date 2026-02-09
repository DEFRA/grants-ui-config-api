import { ApiErrorCode, FormDefinitionRequestType, FormStatus, getErrorMessage } from '@defra/forms-model'

import * as formDefinition from '~/src/api/forms/repositories/form-definition-repository.js'
import * as formMetadata from '~/src/api/forms/repositories/form-metadata-repository.js'
import { getPage, uniquePathGate } from '~/src/api/forms/repositories/helpers.js'
import { getFormDefinition } from '~/src/api/forms/service/definition.js'
import { SUMMARY_PAGE_ID, logger } from '~/src/api/forms/service/shared.js'
import { createFormVersion } from '~/src/api/forms/service/versioning.js'
import { publishFormUpdatedEvent } from '~/src/messaging/publish.js'
import { client } from '~/src/mongo.js'

/**
 * Adds id to summary page if it's missing
 * @param {PageSummary} summaryPage
 */
export const addIdToSummary = (summaryPage) => ({
  id: SUMMARY_PAGE_ID,
  ...summaryPage
})

/**
 * Gets a page from a form definition if it exists, throws a Boom.notFound if not
 * @param {string} formId
 * @param {string} pageId
 * @param {ClientSession} [session]
 */
export async function getFormDefinitionPage(formId, pageId, session) {
  logger.info(`Getting Page ID ${pageId} for Form ID ${formId}`)

  const definition = /** @type {FormDefinition} */ await getFormDefinition(formId, FormStatus.Draft, session)
  const page = getPage(definition, pageId)

  logger.info(`Got Page ID ${pageId} for Form ID ${formId}`)

  return page
}

/**
 * Adds a new page to a draft definition
 * @param {string} formId
 * @param {Page} page
 * @param {FormMetadataAuthor} author
 */
export async function createPageOnDraftDefinition(formId, page, author) {
  logger.info(`Creating new page for form with ID ${formId}`)

  const session = client.startSession()

  /** @type {FormDefinition} */
  const formDraftDefinition = await getFormDefinition(formId, FormStatus.Draft)

  uniquePathGate(
    formDraftDefinition,
    page.path,
    `Duplicate page path on Form ID ${formId}`,
    ApiErrorCode.DuplicatePagePathComponent
  )

  try {
    await session.withTransaction(async () => {
      await formDefinition.addPage(formId, page, session)
      const metadataDocument = await formMetadata.updateAudit(formId, author, session)

      await createFormVersion(formId, session)

      await publishFormUpdatedEvent(metadataDocument, page, FormDefinitionRequestType.CREATE_PAGE)
    })
  } catch (err) {
    logger.error(err, `[addPage] Failed to add page on form ID ${formId} - ${getErrorMessage(err)}`)

    throw err
  } finally {
    await session.endSession()
  }

  logger.info(`Created new page for form with ID ${formId}`)

  return page
}

/**
 * Updates a page on a draft definition
 * @param {string} formId
 * @param {string} pageId
 * @param {Partial<Page>} pageFieldsToUpdate
 * @param {FormMetadataAuthor} author
 */
export async function patchFieldsOnDraftDefinitionPage(formId, pageId, pageFieldsToUpdate, author) {
  const session = client.startSession()
  let page

  try {
    await getFormDefinitionPage(formId, pageId, session)

    if (pageFieldsToUpdate.path) {
      /** @type {FormDefinition} */
      const formDraftDefinition = await getFormDefinition(formId, FormStatus.Draft)

      uniquePathGate(
        formDraftDefinition,
        pageFieldsToUpdate.path,
        `Duplicate page path on Form ID ${formId}`,
        ApiErrorCode.DuplicatePagePathPage,
        pageId
      )
    }

    await session.withTransaction(async () => {
      await formDefinition.updatePageFields(formId, pageId, pageFieldsToUpdate, session)

      page = await getFormDefinitionPage(formId, pageId, session)

      const metadataDocument = await formMetadata.updateAudit(formId, author, session)

      await createFormVersion(formId, session)

      await publishFormUpdatedEvent(
        metadataDocument,
        { pageId, pageFieldsToUpdate },
        FormDefinitionRequestType.UPDATE_PAGE_FIELDS
      )
    })
  } catch (err) {
    logger.error(err, `[updatePage] Failed to update page ${pageId} on form ID ${formId} - ${getErrorMessage(err)}`)

    throw err
  } finally {
    await session.endSession()
  }

  return /** @type {Page | undefined } */ (page)
}

/**
 * Delete a page on a draft definition
 * @param {string} formId
 * @param {string} pageId
 * @param {FormMetadataAuthor} author
 */
export async function deletePageOnDraftDefinition(formId, pageId, author) {
  logger.info(`Deleting Page ID ${pageId} on Form ID ${formId}`)

  const session = client.startSession()

  try {
    await session.withTransaction(async () => {
      await formDefinition.deletePage(formId, pageId, session)

      const metadataDocument = await formMetadata.updateAudit(formId, author, session)

      await createFormVersion(formId, session)

      await publishFormUpdatedEvent(metadataDocument, { pageId }, FormDefinitionRequestType.DELETE_PAGE)
    })
  } catch (err) {
    logger.error(err, `[deletePage] Failed to delete Page ID ${pageId} on Form ID ${formId} - ${getErrorMessage(err)}`)

    throw err
  } finally {
    await session.endSession()
  }

  logger.info(`Deleted Page ID ${pageId} on Form ID ${formId}`)
}

/**
 * @import { FormDefinition, Page, FormMetadataAuthor, PageSummary } from '@defra/forms-model'
 * @import { ClientSession } from 'mongodb'
 */
