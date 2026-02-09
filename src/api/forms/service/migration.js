import {
  FormDefinitionRequestType,
  FormStatus,
  SchemaVersion,
  formDefinitionV2Schema,
  getErrorMessage,
  isSummaryPage
} from '@defra/forms-model'

import * as formDefinition from '~/src/api/forms/repositories/form-definition-repository.js'
import * as formMetadata from '~/src/api/forms/repositories/form-metadata-repository.js'
import { migrateToV2, summaryHelper } from '~/src/api/forms/service/migration-helpers.js'
import { addIdToSummary } from '~/src/api/forms/service/page.js'
import { logger } from '~/src/api/forms/service/shared.js'
import { createFormVersion } from '~/src/api/forms/service/versioning.js'
import { publishFormMigratedEvent, publishFormUpdatedEvent } from '~/src/messaging/publish.js'
import { client } from '~/src/mongo.js'

/**
 * Repositions the summary page if it's not the last index of pages
 * @param {string} formId
 * @param {FormDefinition} definition
 * @param {FormMetadataAuthor} author
 */
export async function repositionSummaryPipeline(formId, definition, author) {
  const summaryResult = summaryHelper(definition)
  const { shouldRepositionSummary } = summaryResult

  logger.info(`Checking position of summary on ${formId}`)

  if (!shouldRepositionSummary) {
    logger.info(`Position of summary on ${formId} correct`)
    return summaryResult
  }

  logger.info(`Updating position of summary on Form ID ${formId}`)

  const session = client.startSession()

  const { summary } = summaryResult
  const summaryDefined = /** @type {PageSummary} */ (summary)
  const summaryWithId = addIdToSummary(summaryDefined)

  try {
    await session.withTransaction(async () => {
      await formDefinition.deletePages(formId, (page) => isSummaryPage(page), session)

      await formDefinition.addPage(formId, summaryWithId, session)

      const metadataDocument = await formMetadata.updateAudit(formId, author, session)

      // TODO: Does this need an enum?
      await publishFormUpdatedEvent(
        metadataDocument,
        { page: summaryWithId },
        FormDefinitionRequestType.REPOSITION_SUMMARY
      )
    })
  } catch (err) {
    logger.error(
      err,
      `[repositionSummary] Failed to update position of summary on Form ID ${formId} - ${getErrorMessage(err)}`
    )
    throw err
  } finally {
    await session.endSession()
  }

  logger.info(`Updated position of summary on Form ID ${formId}`)

  return { ...summaryResult, summary: summaryWithId }
}

/**
 * Migrates a v1 definition to v2
 * @param {string} formId
 * @param {FormMetadataAuthor} author
 */
export async function migrateDefinitionToV2(formId, author) {
  const formDraftDefinition = await formDefinition.get(formId, FormStatus.Draft)

  if (formDraftDefinition.schema === SchemaVersion.V2) {
    return formDraftDefinition
  }

  logger.info(`Migrating form with ID ${formId} to schema version 2`)

  const session = client.startSession()

  let updatedDraftDefinition = formDraftDefinition
  try {
    await session.withTransaction(async () => {
      updatedDraftDefinition = migrateToV2(formDraftDefinition)

      await formDefinition.update(formId, updatedDraftDefinition, session, formDefinitionV2Schema)

      await formMetadata.updateAudit(formId, author, session)

      await createFormVersion(formId, session)

      await publishFormMigratedEvent(formId, new Date(), author)
    })
  } catch (err) {
    logger.error(
      err,
      `[migrateToV2] Failed to migrate form with ID ${formId} to engine version 2 - ${getErrorMessage(err)}`
    )
    throw err
  }

  logger.info(`Migrated form with ID ${formId} to engine version 2`)

  return updatedDraftDefinition
}

// TODO: add migrate to V1

/**
 * @import { FormDefinition, FormMetadataAuthor, PageSummary } from '@defra/forms-model'
 */
