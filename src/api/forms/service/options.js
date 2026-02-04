import { getErrorMessage } from '@defra/forms-model'

import * as formDefinition from '~/src/api/forms/repositories/form-definition-repository.js'
import * as formMetadata from '~/src/api/forms/repositories/form-metadata-repository.js'
import { logger } from '~/src/api/forms/service/shared.js'
import { createFormVersion } from '~/src/api/forms/service/versioning.js'
import { client } from '~/src/mongo.js'

/**
 * Adds or updates an option
 * @param {string} formId
 * @param {string} optionName
 * @param {string} optionValue
 * @param {FormMetadataAuthor} author
 */
export async function updateOptionOnDraftDefinition(
  formId,
  optionName,
  optionValue,
  author
) {
  logger.info(`Updating option ${optionName} on Form ID ${formId}`)

  const session = client.startSession()

  const payload = { option: { [optionName]: optionValue } }

  try {
    await session.withTransaction(async () => {
      await formDefinition.updateOption(
        formId,
        optionName,
        optionValue,
        session
      )

      await formMetadata.updateAudit(formId, author, session)

      await createFormVersion(formId, session)
    })
  } catch (err) {
    logger.error(
      err,
      `[updateOption] Failed to update option ${optionName} on form ID ${formId} - ${getErrorMessage(err)}`
    )

    throw err
  } finally {
    await session.endSession()
  }

  logger.info(`Updated option ${optionName} on Form ID ${formId}`)

  return payload
}

/**
 * @import { FormMetadataAuthor } from '@defra/forms-model'
 */
