import { getErrorMessage } from '@defra/forms-model'

import * as formDefinition from '~/src/api/forms/repositories/form-definition-repository.js'
import * as formMetadata from '~/src/api/forms/repositories/form-metadata-repository.js'
import { logger } from '~/src/api/forms/service/shared.js'
import { createFormVersion } from '~/src/api/forms/service/versioning.js'
import { publishFormUpdatedEvent } from '~/src/messaging/publish.js'
import { client } from '~/src/mongo.js'

/**
 * Assigns sections to pages in the draft form definition.
 * Replaces the sections array and updates page section assignments.
 * @param {string} formId
 * @param {SectionAssignmentItem[]} sectionAssignments
 * @param {FormMetadataAuthor} author
 * @param {FormDefinitionRequestType} requestType
 * @returns {Promise<SectionAssignmentItem[]>}
 */
export async function assignSectionsToForm(formId, sectionAssignments, author, requestType) {
  logger.info(`Assigning sections to form ID ${formId}`)

  const session = client.startSession()

  try {
    const sections = await session.withTransaction(async () => {
      const updatedSections = await formDefinition.assignSections(formId, sectionAssignments, session)

      const metadataDocument = await formMetadata.updateAudit(formId, author, session)

      await createFormVersion(formId, session)

      await publishFormUpdatedEvent(metadataDocument, { sections: sectionAssignments }, requestType)

      return updatedSections
    })

    logger.info(`Assigned sections to form ID ${formId}`)

    return sections
  } catch (err) {
    logger.error(err, `[assignSections] Failed to assign sections to form ID ${formId} - ${getErrorMessage(err)}`)

    throw err
  } finally {
    await session.endSession()
  }
}

/**
 * @import { FormDefinitionRequestType, FormMetadataAuthor, SectionAssignmentItem } from '@defra/forms-model'
 */
