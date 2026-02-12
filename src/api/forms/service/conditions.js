import { FormDefinitionRequestType, getErrorMessage } from '@defra/forms-model'

import * as formDefinition from '~/src/api/forms/repositories/form-definition-repository.js'
import * as formMetadata from '~/src/api/forms/repositories/form-metadata-repository.js'
import { logger } from '~/src/api/forms/service/shared.js'
import { createFormVersion } from '~/src/api/forms/service/versioning.js'
import { publishFormUpdatedEvent } from '~/src/messaging/publish.js'
import { client } from '~/src/mongo.js'

/**
 * Add a condition to the draft form definition
 * @param {string} formId
 * @param {ConditionWrapperV2} condition
 * @param {FormMetadataAuthor} author
 */
export async function addConditionToDraftFormDefinition(formId, condition, author) {
  logger.info(`Adding condition ${condition.displayName} to form ID ${formId}`)

  const session = client.startSession()

  try {
    const newForm = await session.withTransaction(async () => {
      // Add the condition to the form definition
      const returnedCondition = await formDefinition.addCondition(formId, condition, session)

      const metadataDocument = await formMetadata.updateAudit(formId, author, session)

      await createFormVersion(formId, session)

      await publishFormUpdatedEvent(metadataDocument, condition, FormDefinitionRequestType.CREATE_CONDITION)

      return returnedCondition
    })

    logger.info(`Added condition ${condition.displayName} to form ID ${formId}`)

    return newForm
  } catch (err) {
    logger.error(err, `[addCondition] Failed to add condition on Form ID ${formId} - ${getErrorMessage(err)}`)

    throw err
  } finally {
    await session.endSession()
  }
}

/**
 * Update a condition on the draft form definition
 * @param {string} formId
 * @param {string} conditionId
 * @param {ConditionWrapperV2} condition
 * @param {FormMetadataAuthor} author
 */
export async function updateConditionOnDraftFormDefinition(formId, conditionId, condition, author) {
  logger.info(`Updating condition ${conditionId} for form ID ${formId}`)

  const session = client.startSession()

  try {
    const updatedCondition = await session.withTransaction(async () => {
      // Update the condition on the form definition
      const returnedCondition = await formDefinition.updateCondition(formId, conditionId, condition, session)

      const metadataDocument = await formMetadata.updateAudit(formId, author, session)

      await createFormVersion(formId, session)

      await publishFormUpdatedEvent(metadataDocument, condition, FormDefinitionRequestType.UPDATE_CONDITION)

      return returnedCondition
    })

    logger.info(`Updated condition ${conditionId} for form ID ${formId}`)

    return updatedCondition
  } catch (err) {
    logger.error(
      err,
      `[updateCondition] Failed to update condition ${conditionId} on Form ID ${formId} - ${getErrorMessage(err)}`
    )

    throw err
  } finally {
    await session.endSession()
  }
}

/**
 * Remove a condition from the draft form definition
 * @param {string} formId
 * @param {string} conditionId
 * @param {FormMetadataAuthor} author
 */
export async function removeConditionOnDraftFormDefinition(formId, conditionId, author) {
  logger.info(`Removing condition ${conditionId} for form ID ${formId}`)

  const session = client.startSession()

  try {
    await session.withTransaction(async () => {
      // Update the condition on the form definition
      await formDefinition.deleteCondition(formId, conditionId, session)

      const metadataDocument = await formMetadata.updateAudit(formId, author, session)

      await createFormVersion(formId, session)

      await publishFormUpdatedEvent(metadataDocument, { conditionId }, FormDefinitionRequestType.DELETE_CONDITION)
    })

    logger.info(`Removed condition ${conditionId} for form ID ${formId}`)
  } catch (err) {
    logger.error(
      err,
      `[removeCondition] Failed to remove condition ${conditionId} on Form ID ${formId} - ${getErrorMessage(err)}`
    )

    throw err
  } finally {
    await session.endSession()
  }
}

/**
 * @import { FormMetadataAuthor, ConditionWrapperV2 } from '@defra/forms-model'
 */
