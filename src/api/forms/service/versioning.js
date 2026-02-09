import { FormStatus, getErrorMessage } from '@defra/forms-model'

import * as formDefinitionRepository from '~/src/api/forms/repositories/form-definition-repository.js'
import * as formMetadataRepository from '~/src/api/forms/repositories/form-metadata-repository.js'
import * as formVersionsRepository from '~/src/api/forms/repositories/form-versions-repository.js'
import { MAX_VERSIONS } from '~/src/api/forms/repositories/form-versions-repository.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import { client } from '~/src/mongo.js'

const logger = createLogger()

/**
 * Wrapper function to instantiate new session and create form version
 * @param {string} formId
 * @returns {Promise<FormVersionDocument>}
 */
export async function createFormVersionAndSession(formId) {
  const session = client.startSession()

  try {
    return await session.withTransaction(async () => {
      return createFormVersion(formId, session)
    })
  } finally {
    await session.endSession()
  }
}

/**
 * Creates a new version of a form definition
 * @param {string} formId - The form ID
 * @param {ClientSession} session - Existing MongoDB session (if called within a transaction)
 * @returns {Promise<FormVersionDocument>}
 */
export async function createFormVersion(formId, session) {
  logger.info(`Creating new version for form ID ${formId}`)

  try {
    const result = await createVersionInTransaction(formId, session)

    logger.info(`Created version ${result.versionNumber} for form ID ${formId}`)
    return result
  } catch (err) {
    logger.error(err, `[createFormVersion] Failed to create version for form ID ${formId} - ${getErrorMessage(err)}`)
    throw err
  }
}

/**
 * Internal function to create version within a transaction
 * @private
 * @param {string} formId
 * @param {ClientSession} session
 */
async function createVersionInTransaction(formId, session) {
  const nextVersionNumber = await formMetadataRepository.getAndIncrementVersionNumber(formId, session)

  const formDefinition = await formDefinitionRepository.get(formId, FormStatus.Draft, session)

  const createdAt = new Date()

  const versionMetadata = /** @type {FormVersionMetadata} */ ({
    versionNumber: nextVersionNumber,
    createdAt
  })

  await formMetadataRepository.addVersionMetadata(formId, versionMetadata, session)

  const versionDocument = /** @type {FormVersionDocument} */ ({
    formId,
    versionNumber: nextVersionNumber,
    formDefinition,
    createdAt
  })

  try {
    return await formVersionsRepository.createVersion(versionDocument, session)
  } catch (err) {
    logger.error(
      err,
      `Unexpected error creating version ${nextVersionNumber} for form ID ${formId} after atomic increment`
    )
    throw err
  }
}

/**
 * Retrieves a specific version of a form definition
 * @param {string} formId - The form ID
 * @param {number} versionNumber - The version number
 * @returns {Promise<FormVersionDocument>}
 */
export async function getFormVersion(formId, versionNumber) {
  logger.info(`Getting version ${versionNumber} for form ID ${formId}`)

  try {
    return await formVersionsRepository.getVersion(formId, versionNumber)
  } catch (err) {
    logger.error(
      err,
      `[getFormVersion] Failed to get version ${versionNumber} for form ID ${formId} - ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * Retrieves all versions for a form
 * @param {string} formId - The form ID
 * @returns {Promise<FormVersionDocument[]>}
 */
export async function getFormVersions(formId) {
  logger.info(`Getting all versions for form ID ${formId}`)

  try {
    const { versions } = await formVersionsRepository.getVersions(formId, undefined, MAX_VERSIONS, 0)
    return versions
  } catch (err) {
    logger.error(err, `[getFormVersions] Failed to get versions for form ID ${formId} - ${getErrorMessage(err)}`)
    throw err
  }
}

/**
 * Gets the latest version of a form
 * @param {string} formId - The form ID
 * @returns {Promise<FormVersionDocument | null>}
 */
export async function getLatestFormVersion(formId) {
  logger.info(`Getting latest version for form ID ${formId}`)

  try {
    return await formVersionsRepository.getLatestVersion(formId)
  } catch (err) {
    logger.error(
      err,
      `[getLatestFormVersion] Failed to get latest version for form ID ${formId} - ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * Removes all versions for a form
 * @param {string} formId - The form ID
 * @param {ClientSession} session - MongoDB transaction session
 */
export async function removeFormVersions(formId, session) {
  logger.info(`Removing all versions for form ID ${formId}`)

  try {
    await formVersionsRepository.removeVersionsForForm(formId, session)
    logger.info(`Removed all versions for form ID ${formId}`)
  } catch (err) {
    logger.error(err, `[removeFormVersions] Failed to remove versions for form ID ${formId} - ${getErrorMessage(err)}`)
    throw err
  }
}

/**
 * @import { FormVersionMetadata } from '@defra/forms-model'
 * @import { FormVersionDocument } from '~/src/api/types.js'
 * @import { ClientSession } from 'mongodb'
 */
