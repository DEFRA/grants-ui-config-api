import { FormStatus, getErrorMessage } from '@defra/forms-model'
import Boom from '@hapi/boom'

import * as formDefinition from '~/src/api/forms/repositories/form-definition-repository.js'
import * as formMetadata from '~/src/api/forms/repositories/form-metadata-repository.js'
import { findComponent } from '~/src/api/forms/repositories/helpers.js'
import { getFormDefinition } from '~/src/api/forms/service/definition.js'
import { getFormDefinitionPage } from '~/src/api/forms/service/page.js'
import { logger } from '~/src/api/forms/service/shared.js'
import { createFormVersion } from '~/src/api/forms/service/versioning.js'
import { client } from '~/src/mongo.js'

/**
 * Gets a component from a formDefintion page if it exists, throws a Boom.notFound if not
 * @param {string} formId
 * @param {string} pageId
 * @param {string} componentId
 * @param {ClientSession} [session]
 */
export async function getFormDefinitionPageComponent(
  formId,
  pageId,
  componentId,
  session
) {
  logger.info(
    `Getting Component ID ${componentId} on Page ID ${pageId} & Form ID ${formId}`
  )

  const definition = /** @type {FormDefinition} */ await getFormDefinition(
    formId,
    FormStatus.Draft,
    session
  )
  const component = findComponent(definition, pageId, componentId)

  if (component === undefined) {
    throw Boom.notFound(
      `Component ID ${componentId} not found on Page ID ${pageId} & Form ID ${formId}`
    )
  }
  logger.info(
    `Got Component ID ${componentId} on Page ID ${pageId} & Form ID ${formId}`
  )

  return component
}

/**
 * Adds a component to the end of page components
 * @param {string} formId
 * @param {string} pageId
 * @param {ComponentDef} component
 * @param {FormMetadataAuthor} author
 * @param {boolean} prepend
 */
export async function createComponentOnDraftDefinition(
  formId,
  pageId,
  component,
  author,
  prepend = false
) {
  await getFormDefinitionPage(formId, pageId)

  logger.info(`Adding new component on Page ID ${pageId} on Form ID ${formId}`)

  const session = client.startSession()

  try {
    await session.withTransaction(async () => {
      await formDefinition.addComponent(
        formId,
        pageId,
        component,
        session,
        prepend ? 0 : undefined
      )

      await formMetadata.updateAudit(formId, author, session)

      await createFormVersion(formId, session)
    })
  } catch (err) {
    logger.error(
      err,
      `[addComponent] Failed to add component to page ${pageId} on form ID ${formId} - ${getErrorMessage(err)}`
    )

    throw err
  } finally {
    await session.endSession()
  }

  logger.info(`Added new component on Page ID ${pageId} on Form ID ${formId}`)

  return component
}

/**
 * Updates a component and throws a Boom.notFound if page or component is not found
 * @param {string} formId
 * @param {string} pageId
 * @param {string} componentId
 * @param {ComponentDef} componentPayload
 * @param {FormMetadataAuthor} author
 */
export async function updateComponentOnDraftDefinition(
  formId,
  pageId,
  componentId,
  componentPayload,
  author
) {
  logger.info(
    `Updating Component ID ${componentId} on Page ID ${pageId} & Form ID ${formId}`
  )

  const session = client.startSession()

  try {
    const updatedFormDefinitionPageComponent = await session.withTransaction(
      async () => {
        const formDefinitionPageComponent =
          await formDefinition.updateComponent(
            formId,
            pageId,
            componentId,
            componentPayload,
            session
          )

        await formMetadata.updateAudit(formId, author, session)

        await createFormVersion(formId, session)

        return formDefinitionPageComponent
      }
    )

    logger.info(
      `Updated Component ID ${componentId} on Page ID ${pageId} & Form ID ${formId}`
    )

    return updatedFormDefinitionPageComponent
  } catch (err) {
    logger.error(
      err,
      `[updateComponent] Failed to update component ${componentId} on page ${pageId} for form ID ${formId} - ${getErrorMessage(err)}`
    )

    throw err
  } finally {
    await session.endSession()
  }
}

/**
 * Updates a component and throws a Boom.notFound if page or component is not found
 * @param {string} formId
 * @param {string} pageId
 * @param {string} componentId
 * @param {FormMetadataAuthor} author
 */
export async function deleteComponentOnDraftDefinition(
  formId,
  pageId,
  componentId,
  author
) {
  logger.info(
    `Deleting Component ID ${componentId} on Page ID ${pageId} & Form ID ${formId}`
  )

  const session = client.startSession()

  try {
    await session.withTransaction(async () => {
      await formDefinition.deleteComponent(formId, pageId, componentId, session)

      await formMetadata.updateAudit(formId, author, session)

      await createFormVersion(formId, session)
    })
  } catch (err) {
    logger.error(
      err,
      `[removeComponent] Failed to remove component ${componentId} from page ${pageId} on form ID ${formId} - ${getErrorMessage(err)}`
    )

    throw err
  } finally {
    await session.endSession()
  }

  logger.info(
    `Deleted Component ID ${componentId} on Page ID ${pageId} & Form ID ${formId}`
  )
}

/**
 * @import { FormDefinition, ComponentDef, FormMetadataAuthor } from '@defra/forms-model'
 * @import { ClientSession } from 'mongodb'
 */
