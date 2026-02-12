import { getErrorMessage } from '@defra/forms-model'

import * as def from '~/src/api/forms/repositories/form-definition-repository.js'
import * as meta from '~/src/api/forms/repositories/form-metadata-repository.js'
import { mapForm, mapToDocument } from '~/src/api/forms/service/shared.js'
import { createFormVersion } from '~/src/api/forms/service/versioning.js'
import { feedbackDefinition } from '~/src/helpers/feedback-form/definition.js'
import { feedbackMetadata } from '~/src/helpers/feedback-form/metadata.js'

const moduleTag = '[reinstateFeedbackForm]'

/**
 * @param {FormMetadata} metadata
 * @param {ClientSession} session
 * @param {Logger} logger
 */
export async function saveMetadata(metadata, session, logger) {
  const { modifiedCount, upsertedCount } = await meta.upsert(metadata, session)

  if (modifiedCount || upsertedCount) {
    logger.info(`${moduleTag} Metadata - inserted or updated`)
  } else {
    logger.info(`${moduleTag} Metadata - already exists with correct content`)
  }
}

/**
 * @param {string} formId
 * @param {ClientSession} session
 * @param {Logger} logger
 */
export async function saveDefinition(formId, session, logger) {
  const result = await def.upsertDraftAndLive(
    formId,
    {
      draft: feedbackDefinition,
      live: feedbackDefinition
    },
    session
  )

  if (result.modifiedCount || result.upsertedCount) {
    logger.info(`${moduleTag} Definition - inserted or updated`)
  } else {
    logger.info(`${moduleTag} Definition - already exists with correct content`)
  }

  return result
}

/**
 * @param {string} formId
 * @param {ClientSession} session
 */
export async function saveFormVersion(formId, session) {
  return createFormVersion(formId, session)
}

/**
 * Ensure the feedback form always exists in the database
 * @param {MongoClient} client
 * @param {Logger} logger
 */
export async function reinstateFeedbackForm(client, logger) {
  const session = client.startSession()

  logger.info(`${moduleTag} Checking if feedback form exists and has correct contents`)

  try {
    await session.withTransaction(async () => {
      // Ensure definition exists with expected content
      const { upsertedCount, modifiedCount } = await saveDefinition(feedbackMetadata.id, session, logger)

      let currentMeta
      try {
        currentMeta = await meta.get(feedbackMetadata.id, session)
      } catch {}

      // Align structures, whether from DB or codebase metadata
      const metadata = currentMeta ? mapForm(currentMeta) : mapForm(mapToDocument(feedbackMetadata))

      // Only update timestamps if the form definition has changed or was newly-inserted
      const now = new Date()

      if (upsertedCount) {
        // Set CreatedAt timestamp on metadata
        metadata.createdAt = now
        metadata.updatedAt = now
        if (metadata.live) {
          metadata.live.createdAt = now
          metadata.live.updatedAt = now
        }
      }

      if (upsertedCount || modifiedCount) {
        // Set UpdatedAt timestamp on metadata
        metadata.updatedAt = now
        if (metadata.live) {
          metadata.live.updatedAt = now
        }
      }

      // Ensure metadata exists with expected content
      await saveMetadata(metadata, session, logger)

      await saveFormVersion(feedbackMetadata.id, session)
    })
    logger.info(`${moduleTag} Completed check for feedback form`)
  } catch (err) {
    logger.error(err, `${moduleTag} Failed during reinstate Feedback Form - ${getErrorMessage(err)}`)
  } finally {
    await session.endSession()
  }
}

/**
 * @import { ClientSession, MongoClient, UpdateResult } from 'mongodb'
 * @import { FormMetadata } from '@defra/forms-model'
 * @import { Logger } from 'pino'
 */
