import {
  AuditEventMessageCategory,
  AuditEventMessageSchemaVersion,
  AuditEventMessageSource,
  AuditEventMessageType
} from '@defra/forms-model'

import { createFormMessageDataBase, createV1MessageBase } from '~/src/messaging/mappers/base.js'

/**
 * @param {FormMetadata} metadata
 * @returns {FormCreatedMessage}
 */
export function formCreatedEventMapper(metadata) {
  /** @type {FormCreatedMessageData} */
  const data = {
    formId: metadata.id,
    slug: metadata.slug,
    title: metadata.title,
    organisation: metadata.organisation,
    teamName: metadata.teamName,
    teamEmail: metadata.teamEmail
  }
  return {
    schemaVersion: AuditEventMessageSchemaVersion.V1,
    category: AuditEventMessageCategory.FORM,
    source: AuditEventMessageSource.FORMS_MANAGER,
    type: AuditEventMessageType.FORM_CREATED,
    entityId: metadata.id,
    createdAt: metadata.createdAt,
    createdBy: {
      id: metadata.createdBy.id,
      displayName: metadata.createdBy.displayName
    },
    data,
    messageCreatedAt: new Date()
  }
}

/**
 * @param {FormMetadata} metadata
 * @param {FormMetadata} oldMetadata
 * @returns {FormTitleUpdatedMessage}
 */
export function formTitleUpdatedMapper(metadata, oldMetadata) {
  const { title } = metadata
  const { title: oldTitle } = oldMetadata

  const baseData = createFormMessageDataBase(metadata)

  /**
   * @type {FormTitleUpdatedMessageData}
   */
  const data = {
    ...baseData,
    changes: {
      previous: {
        title: oldTitle
      },
      new: {
        title
      }
    }
  }
  const auditMessageBase = createV1MessageBase(oldMetadata, metadata)

  return {
    ...auditMessageBase,
    data,
    category: AuditEventMessageCategory.FORM,
    type: AuditEventMessageType.FORM_TITLE_UPDATED
  }
}

/**
 * @param {FormMetadata} metadata
 * @param {PartialFormMetadataDocument} updatedForm
 * @returns {FormOrganisationUpdatedMessage}
 */
export function formOrganisationUpdatedMapper(metadata, updatedForm) {
  const { organisation: oldOrganisation } = metadata
  const { organisation } = updatedForm

  if (!organisation) {
    throw new Error('Unexpected missing organisation')
  }

  const baseData = createFormMessageDataBase(metadata)

  /**
   * @type {FormOrganisationUpdatedMessageData}
   */
  const data = {
    ...baseData,
    changes: {
      previous: {
        organisation: oldOrganisation
      },
      new: {
        organisation
      }
    }
  }
  const auditMessageBase = createV1MessageBase(metadata, updatedForm)

  return {
    ...auditMessageBase,
    data,
    category: AuditEventMessageCategory.FORM,
    type: AuditEventMessageType.FORM_ORGANISATION_UPDATED
  }
}

/**
 * @param {FormMetadata} metadata
 * @param {PartialFormMetadataDocument} updatedForm
 * @returns {FormTeamNameUpdatedMessage}
 */
export function formTeamNameUpdatedMapper(metadata, updatedForm) {
  const { teamName: oldTeamName } = metadata
  const { teamName } = updatedForm

  if (!teamName) {
    throw new Error('Unexpected missing teamName')
  }

  const baseData = createFormMessageDataBase(metadata)

  /**
   * @type {FormTeamNameUpdatedMessageData}
   */
  const data = {
    ...baseData,
    changes: {
      previous: {
        teamName: oldTeamName
      },
      new: {
        teamName
      }
    }
  }
  const auditMessageBase = createV1MessageBase(metadata, updatedForm)

  return {
    ...auditMessageBase,
    data,
    category: AuditEventMessageCategory.FORM,
    type: AuditEventMessageType.FORM_TEAM_NAME_UPDATED
  }
}

/**
 * @param {FormMetadata} metadata
 * @param {PartialFormMetadataDocument} updatedForm
 * @returns {FormTeamEmailUpdatedMessage}
 */
export function formTeamEmailUpdatedMapper(metadata, updatedForm) {
  const { teamEmail: oldTeamEmail } = metadata
  const { teamEmail } = updatedForm

  if (!teamEmail) {
    throw new Error('Unexpected missing teamEmail')
  }

  const baseData = createFormMessageDataBase(metadata)

  /**
   * @type {FormTeamEmailUpdatedMessageData}
   */
  const data = {
    ...baseData,
    changes: {
      previous: {
        teamEmail: oldTeamEmail
      },
      new: {
        teamEmail
      }
    }
  }
  const auditMessageBase = createV1MessageBase(metadata, updatedForm)

  return {
    ...auditMessageBase,
    data,
    category: AuditEventMessageCategory.FORM,
    type: AuditEventMessageType.FORM_TEAM_EMAIL_UPDATED
  }
}

/**
 * @param {FormMetadata} metadata
 * @param {PartialFormMetadataDocument} updatedForm
 * @returns {FormNotificationEmailUpdatedMessage}
 */
export function formNotificationEmailUpdatedMapper(metadata, updatedForm) {
  const { notificationEmail: oldNotificationEmail } = metadata
  const { notificationEmail } = updatedForm
  const baseData = createFormMessageDataBase(metadata)

  /**
   * @type {FormNotificationEmailUpdatedMessageData}
   */
  const data = {
    ...baseData,
    changes: {
      previous: {
        notificationEmail: oldNotificationEmail
      },
      new: {
        notificationEmail
      }
    }
  }
  const auditMessageBase = createV1MessageBase(metadata, updatedForm)

  return {
    ...auditMessageBase,
    data,
    category: AuditEventMessageCategory.FORM,
    type: AuditEventMessageType.FORM_NOTIFICATION_EMAIL_UPDATED
  }
}

/**
 * @param {FormMetadata} metadata
 * @param {PartialFormMetadataDocument} updatedForm
 * @returns {FormSubmissionGuidanceUpdatedMessage}
 */
export function formSubmissionGuidanceUpdatedMapper(metadata, updatedForm) {
  const { submissionGuidance: oldSubmissionGuidance } = metadata
  const { submissionGuidance } = updatedForm
  const baseData = createFormMessageDataBase(metadata)

  /**
   * @type {FormSubmissionGuidanceUpdatedMessageData}
   */
  const data = {
    ...baseData,
    changes: {
      previous: {
        submissionGuidance: oldSubmissionGuidance
      },
      new: {
        submissionGuidance
      }
    }
  }
  const auditMessageBase = createV1MessageBase(metadata, updatedForm)

  return {
    ...auditMessageBase,
    data,
    category: AuditEventMessageCategory.FORM,
    type: AuditEventMessageType.FORM_SUBMISSION_GUIDANCE_UPDATED
  }
}

/**
 * @param {FormMetadata} metadata
 * @param {PartialFormMetadataDocument} updatedForm
 * @returns {FormPrivacyNoticeUpdatedMessage}
 */
export function formPrivacyNoticeUpdatedMapper(metadata, updatedForm) {
  const { privacyNoticeUrl: oldPrivacyNoticeUrl } = metadata
  const { privacyNoticeUrl } = updatedForm
  const baseData = createFormMessageDataBase(metadata)

  /**
   * @type {FormPrivacyNoticeUpdatedMessageData}
   */
  const data = {
    ...baseData,
    changes: {
      previous: {
        privacyNoticeUrl: oldPrivacyNoticeUrl
      },
      new: {
        privacyNoticeUrl
      }
    }
  }
  const auditMessageBase = createV1MessageBase(metadata, updatedForm)

  return {
    ...auditMessageBase,
    data,
    category: AuditEventMessageCategory.FORM,
    type: AuditEventMessageType.FORM_PRIVACY_NOTICE_UPDATED
  }
}

/**
 * @param {FormMetadata} metadata
 * @param {PartialFormMetadataDocument} updatedForm
 * @returns {FormSupportContactUpdatedMessage}
 */
export function formSupportUpdatedMapper(metadata, updatedForm) {
  const { contact: oldContact } = metadata
  const { contact } = updatedForm
  const baseData = createFormMessageDataBase(metadata)

  /**
   * @type {FormSupportContactUpdatedMessageData}
   */
  const data = {
    ...baseData,
    changes: {
      previous: {
        contact: oldContact
      },
      new: {
        contact
      }
    }
  }
  const auditMessageBase = createV1MessageBase(metadata, updatedForm)

  return {
    ...auditMessageBase,
    data,
    category: AuditEventMessageCategory.FORM,
    type: AuditEventMessageType.FORM_SUPPORT_CONTACT_UPDATED
  }
}

/**
 * @param {string} formId
 * @param {Date} createdAt
 * @param {AuditUser} createdBy
 * @returns {FormLiveCreatedFromDraftMessage}
 */
export function formLiveCreatedFromDraftMapper(formId, createdAt, createdBy) {
  return {
    schemaVersion: AuditEventMessageSchemaVersion.V1,
    category: AuditEventMessageCategory.FORM,
    source: AuditEventMessageSource.FORMS_MANAGER,
    type: AuditEventMessageType.FORM_LIVE_CREATED_FROM_DRAFT,
    entityId: formId,
    createdAt,
    createdBy,
    messageCreatedAt: new Date()
  }
}

/**
 * @param {string} formId
 * @param {Date} createdAt
 * @param {AuditUser} createdBy
 * @returns {FormDraftCreatedFromLiveMessage}
 */
export function formDraftCreatedFromLiveMapper(formId, createdAt, createdBy) {
  return {
    schemaVersion: AuditEventMessageSchemaVersion.V1,
    category: AuditEventMessageCategory.FORM,
    source: AuditEventMessageSource.FORMS_MANAGER,
    type: AuditEventMessageType.FORM_DRAFT_CREATED_FROM_LIVE,
    entityId: formId,
    createdAt,
    createdBy,
    messageCreatedAt: new Date()
  }
}

/**
 * @param {FormMetadata} metadata
 * @param {AuditUser} author
 * @returns {FormDraftDeletedMessage}
 */
export function formDraftDeletedMapper(metadata, author) {
  const auditTime = new Date()
  return {
    schemaVersion: AuditEventMessageSchemaVersion.V1,
    category: AuditEventMessageCategory.FORM,
    source: AuditEventMessageSource.FORMS_MANAGER,
    type: AuditEventMessageType.FORM_DRAFT_DELETED,
    createdAt: auditTime,
    messageCreatedAt: auditTime,
    createdBy: author,
    entityId: metadata.id,
    data: {
      formId: metadata.id,
      slug: metadata.slug
    }
  }
}

/**
 * @param {string} formId
 * @param {Date} createdAt
 * @param {AuditUser} createdBy
 * @returns {FormMigratedMessage}
 */
export function formMigratedMapper(formId, createdAt, createdBy) {
  return {
    schemaVersion: AuditEventMessageSchemaVersion.V1,
    category: AuditEventMessageCategory.FORM,
    source: AuditEventMessageSource.FORMS_MANAGER,
    type: AuditEventMessageType.FORM_MIGRATED,
    entityId: formId,
    createdAt,
    createdBy,
    messageCreatedAt: new Date()
  }
}

/**
 *
 * @param {FormMetadata} metadata
 * @param {FormDefinitionRequestType} requestType
 * @param {{
 *   payload: unknown;
 *   s3Meta?: undefined
 * } | {
 *   payload?: undefined
 *   s3Meta: FormDefinitionS3Meta
 * }} formState
 * @returns {FormUpdatedMessage}
 */
export function formUpdatedMapper(metadata, requestType, { payload, s3Meta }) {
  const baseData = createFormMessageDataBase(metadata)
  const auditMessageBase = createV1MessageBase(metadata, {})

  return {
    category: AuditEventMessageCategory.FORM,
    type: AuditEventMessageType.FORM_UPDATED,
    ...auditMessageBase,
    data: {
      ...baseData,
      requestType,
      s3Meta,
      payload
    }
  }
}

/**
 * @import { FormDefinitionS3Meta, FormUpdatedMessage, FormDefinitionRequestType, FormDraftDeletedMessage, AuditUser, FormTitleUpdatedMessageData, FormOrganisationUpdatedMessage, FormOrganisationUpdatedMessageData, FormMetadata, FormCreatedMessage, FormCreatedMessageData, FormTitleUpdatedMessage, FormTeamNameUpdatedMessage, FormTeamNameUpdatedMessageData, FormTeamEmailUpdatedMessage, FormTeamEmailUpdatedMessageData, FormPrivacyNoticeUpdatedMessage, FormPrivacyNoticeUpdatedMessageData, FormSubmissionGuidanceUpdatedMessage, FormSubmissionGuidanceUpdatedMessageData, FormNotificationEmailUpdatedMessage, FormNotificationEmailUpdatedMessageData, FormSupportContactUpdatedMessage, FormSupportContactUpdatedMessageData, FormLiveCreatedFromDraftMessage, FormDraftCreatedFromLiveMessage, FormMigratedMessage } from '@defra/forms-model'
 * @import { PartialFormMetadataDocument } from '~/src/api/types.js'
 */
