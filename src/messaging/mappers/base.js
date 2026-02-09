import { AuditEventMessageSchemaVersion, AuditEventMessageSource } from '@defra/forms-model'

/**
 * Helper to create the base message
 * @param {FormMetadata} metadata
 * @param {PartialFormMetadataDocument} updatedForm
 * @returns {Omit<ManagerMessageBase, 'category'|'type'>}
 */
export function createV1MessageBase(metadata, updatedForm) {
  return {
    schemaVersion: AuditEventMessageSchemaVersion.V1,
    source: AuditEventMessageSource.FORMS_MANAGER,
    entityId: metadata.id,
    createdAt: updatedForm.updatedAt ?? metadata.updatedAt,
    createdBy: updatedForm.updatedBy?.id
      ? {
          id: updatedForm.updatedBy.id,
          displayName: updatedForm.updatedBy.displayName
        }
      : {
          id: metadata.updatedBy.id,
          displayName: metadata.updatedBy.displayName
        },
    messageCreatedAt: new Date()
  }
}

/**
 *
 * @param {FormMetadata} metadata
 * @returns {FormMessageDataBase}
 */
export function createFormMessageDataBase(metadata) {
  return {
    formId: metadata.id,
    slug: metadata.slug
  }
}

/**
 * @import { ManagerMessageBase, FormMessageDataBase, FormMetadata } from '@defra/forms-model'
 * @import { PartialFormMetadataDocument } from '~/src/api/types.js'
 */
