import {
  AuditEventMessageCategory,
  AuditEventMessageSchemaVersion,
  AuditEventMessageSource,
  AuditEventMessageType
} from '@defra/forms-model'

import createdBy from '~/src/api/forms/service/__stubs__/author.js'

const createdAt = new Date('2025-07-26')
const schemaVersion = AuditEventMessageSchemaVersion.V1
const messageCreatedAt = createdAt
const formId = '689b7ab1d0eeac9711a7fb33'
const entityId = formId
const slug = 'audit-form'
const dataBase = {
  formId,
  slug
}

/**
 * @param {Partial<MessageBase>} partialFormMessageBase
 * @returns {Omit<MessageBase, 'type'|'category'|'entityId'|'data'>}
 */
export function buildFormMessageBase(partialFormMessageBase = {}) {
  return {
    schemaVersion,
    source: AuditEventMessageSource.FORMS_MANAGER,
    messageCreatedAt,
    createdAt,
    createdBy,
    ...partialFormMessageBase
  }
}

/**
 * @param {Partial<FormTitleUpdatedMessage>} partialFormTitleUpdatedMessage
 * @returns {FormTitleUpdatedMessage}
 */
export function buildFormTitleUpdatedMessage(partialFormTitleUpdatedMessage = {}) {
  return {
    ...buildFormMessageBase(),
    entityId,
    source: AuditEventMessageSource.FORMS_MANAGER,
    schemaVersion: AuditEventMessageSchemaVersion.V1,
    category: AuditEventMessageCategory.FORM,
    type: AuditEventMessageType.FORM_TITLE_UPDATED,
    data: {
      ...dataBase,
      changes: {
        previous: {
          title: 'Previous title'
        },
        new: {
          title: 'New title'
        }
      }
    },
    ...partialFormTitleUpdatedMessage
  }
}

/**
 * @param {Partial<FormOrganisationUpdatedMessage>} partialFormOrganisationUpdatedMessage
 * @returns {FormOrganisationUpdatedMessage}
 */
export function buildFormOrganisationUpdatedMessage(partialFormOrganisationUpdatedMessage = {}) {
  return {
    ...buildFormMessageBase(),
    entityId,
    source: AuditEventMessageSource.FORMS_MANAGER,
    schemaVersion: AuditEventMessageSchemaVersion.V1,
    category: AuditEventMessageCategory.FORM,
    type: AuditEventMessageType.FORM_ORGANISATION_UPDATED,
    data: {
      ...dataBase,
      changes: {
        previous: {
          organisation: 'Natural England'
        },
        new: {
          organisation: 'Defra'
        }
      }
    },
    ...partialFormOrganisationUpdatedMessage
  }
}

/**
 * @import { MessageBase, AuditMessage, FormTitleUpdatedMessage, FormOrganisationUpdatedMessage } from '@defra/forms-model'
 */
