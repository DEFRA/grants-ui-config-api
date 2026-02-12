import {
  AuditEventMessageCategory,
  AuditEventMessageSchemaVersion,
  AuditEventMessageSource,
  AuditEventMessageType,
  FormDefinitionRequestType
} from '@defra/forms-model'
import { buildDefinition, buildMetaData, buildQuestionPage } from '@defra/forms-model/stubs'
import { ValidationError } from 'joi'

import author from '~/src/api/forms/service/__stubs__/author.js'
import { BASE_CREATED_DATE, formMetadataDocument } from '~/src/api/forms/service/__stubs__/service.js'
import { buildFormOrganisationUpdatedMessage } from '~/src/messaging/__stubs__/messages.js'
import { publishEvent } from '~/src/messaging/publish-base.js'
import {
  bulkPublishEvents,
  publishDraftCreatedFromLiveEvent,
  publishFormCreatedEvent,
  publishFormDraftDeletedEvent,
  publishFormDraftReplacedEvent,
  publishFormMigratedEvent,
  publishFormTitleUpdatedEvent,
  publishFormUpdatedEvent,
  publishLiveCreatedFromDraftEvent
} from '~/src/messaging/publish.js'
import { saveToS3 } from '~/src/messaging/s3.js'
jest.mock('~/src/messaging/s3.js')

jest.mock('~/src/messaging/publish-base.js')

describe('publish', () => {
  const formId = '689b7ab1d0eeac9711a7fb33'
  const slug = 'audit-form'
  const title = 'My Audit Event Form'
  const organisation = 'Defra'
  const teamName = 'Forms'
  const teamEmail = 'forms@example.uk'
  const createdAt = new Date('2025-07-23')
  const createdBy = {
    id: '83f09a7d-c80c-4e15-bcf3-641559c7b8a7',
    displayName: 'Enrique Chase'
  }
  const updatedAt = new Date('2025-07-24')
  const updatedBy = {
    id: 'a53b4360-bdf6-4d13-8975-25032ce76312',
    displayName: 'Gandalf'
  }
  const messageId = '2888a402-7609-43c5-975f-b1974969cdb6'
  const metadata = buildMetaData({
    id: formId,
    slug,
    title,
    organisation,
    teamName,
    teamEmail,
    createdAt,
    createdBy,
    updatedAt,
    updatedBy
  })

  beforeEach(() => {
    jest.mocked(publishEvent).mockResolvedValue({
      MessageId: '2888a402-7609-43c5-975f-b1974969cdb6',
      SequenceNumber: undefined,
      $metadata: {}
    })
  })
  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('publishFormCreatedEvent', () => {
    it('should publish FORM_CREATED event', async () => {
      await publishFormCreatedEvent(metadata)

      expect(publishEvent).toHaveBeenCalledWith({
        entityId: formId,
        source: AuditEventMessageSource.FORMS_MANAGER,
        messageCreatedAt: expect.any(Date),
        schemaVersion: AuditEventMessageSchemaVersion.V1,
        category: AuditEventMessageCategory.FORM,
        type: AuditEventMessageType.FORM_CREATED,
        createdAt,
        createdBy,
        data: {
          formId,
          slug,
          title,
          organisation,
          teamName,
          teamEmail
        }
      })
      const [publishEventCall] = jest.mocked(publishEvent).mock.calls[0]
      expect(publishEventCall).toMatchSnapshot({
        messageCreatedAt: expect.any(Date)
      })
    })

    it('should not publish the event if the schema is incorrect', async () => {
      jest.mocked(publishEvent).mockRejectedValue(new Error('rejected'))
      const invalidMetaData = {
        title,
        organisation,
        teamName,
        teamEmail,
        createdAt,
        createdBy
      }

      // @ts-expect-error - invalid schema
      await expect(publishFormCreatedEvent(invalidMetaData)).rejects.toThrow(
        new ValidationError(
          '"entityId" is required. "data.formId" is required. "data.slug" is required',
          [],
          invalidMetaData
        )
      )
    })
  })

  describe('publishFormTitleUpdatedEvent', () => {
    it('should publish FORM_TITLE_UPDATED event', async () => {
      const oldMetadata = buildMetaData({
        ...metadata,
        title: 'Old form title'
      })
      const response = await publishFormTitleUpdatedEvent(metadata, oldMetadata)
      expect(response?.MessageId).toBe(messageId)
      expect(publishEvent).toHaveBeenCalledWith({
        entityId: formId,
        messageCreatedAt: expect.any(Date),
        source: AuditEventMessageSource.FORMS_MANAGER,
        schemaVersion: AuditEventMessageSchemaVersion.V1,
        category: AuditEventMessageCategory.FORM,
        type: AuditEventMessageType.FORM_TITLE_UPDATED,
        createdAt: updatedAt,
        createdBy: updatedBy,
        data: {
          formId,
          slug: 'audit-form',
          changes: {
            previous: {
              title: 'Old form title'
            },
            new: {
              title
            }
          }
        }
      })
      const [publishEventCall] = jest.mocked(publishEvent).mock.calls[0]
      expect(publishEventCall).toMatchSnapshot({
        messageCreatedAt: expect.any(Date)
      })
    })
  })

  describe('publishLiveCreatedFromDraftEvent', () => {
    it('should publish FORM_LIVE_CREATED_FROM_DRAFT event', async () => {
      const response = await publishLiveCreatedFromDraftEvent(formId, updatedAt, updatedBy)

      expect(response?.MessageId).toBe(messageId)
      expect(publishEvent).toHaveBeenCalledWith({
        entityId: formId,
        source: AuditEventMessageSource.FORMS_MANAGER,
        messageCreatedAt: expect.any(Date),
        schemaVersion: AuditEventMessageSchemaVersion.V1,
        category: AuditEventMessageCategory.FORM,
        type: AuditEventMessageType.FORM_LIVE_CREATED_FROM_DRAFT,
        createdAt: updatedAt,
        createdBy: updatedBy
      })
      const [publishEventCall] = jest.mocked(publishEvent).mock.calls[0]
      expect(publishEventCall).toMatchSnapshot({
        messageCreatedAt: expect.any(Date)
      })
    })
  })

  describe('publishDraftCreatedFromLiveEvent', () => {
    it('should publish FORM_DRAFT_CREATED_FROM_LIVE event', async () => {
      const response = await publishDraftCreatedFromLiveEvent(formId, updatedAt, updatedBy)

      expect(response?.MessageId).toBe(messageId)
      expect(publishEvent).toHaveBeenCalledWith({
        entityId: formId,
        source: AuditEventMessageSource.FORMS_MANAGER,
        messageCreatedAt: expect.any(Date),
        schemaVersion: AuditEventMessageSchemaVersion.V1,
        category: AuditEventMessageCategory.FORM,
        type: AuditEventMessageType.FORM_DRAFT_CREATED_FROM_LIVE,
        createdAt: updatedAt,
        createdBy: updatedBy
      })
      const [publishEventCall] = jest.mocked(publishEvent).mock.calls[0]
      expect(publishEventCall).toMatchSnapshot({
        messageCreatedAt: expect.any(Date)
      })
    })
  })

  describe('publishFormDraftDeletedEvent', () => {
    it('should publish a FORM_DRAFT_DELETED event', async () => {
      const response = await publishFormDraftDeletedEvent(metadata, author)
      expect(response?.MessageId).toBe(messageId)
      expect(publishEvent).toHaveBeenCalledWith({
        entityId: formId,
        source: AuditEventMessageSource.FORMS_MANAGER,
        messageCreatedAt: expect.any(Date),
        schemaVersion: AuditEventMessageSchemaVersion.V1,
        category: AuditEventMessageCategory.FORM,
        type: AuditEventMessageType.FORM_DRAFT_DELETED,
        createdAt: expect.any(Date),
        createdBy: author,
        data: {
          formId,
          slug
        }
      })
      const [publishEventCall] = jest.mocked(publishEvent).mock.calls[0]
      expect(publishEventCall).toMatchSnapshot({
        messageCreatedAt: expect.any(Date),
        createdAt: expect.any(Date)
      })
    })
  })

  describe('publishFormMigratedEvent', () => {
    it('should publish FORM_MIGRATED event', async () => {
      const response = await publishFormMigratedEvent(formId, updatedAt, updatedBy)

      expect(response?.MessageId).toBe(messageId)
      expect(publishEvent).toHaveBeenCalledWith({
        entityId: formId,
        source: AuditEventMessageSource.FORMS_MANAGER,
        messageCreatedAt: expect.any(Date),
        schemaVersion: AuditEventMessageSchemaVersion.V1,
        category: AuditEventMessageCategory.FORM,
        type: AuditEventMessageType.FORM_MIGRATED,
        createdAt: updatedAt,
        createdBy: updatedBy
      })
      const [publishEventCall] = jest.mocked(publishEvent).mock.calls[0]
      expect(publishEventCall).toMatchSnapshot({
        messageCreatedAt: expect.any(Date)
      })
    })
  })

  describe('publishFormUpdatedEvent', () => {
    it('should publish a FORM_UPDATED event', async () => {
      const requestType = FormDefinitionRequestType.CREATE_PAGE
      const payload = buildQuestionPage({})
      await publishFormUpdatedEvent(formMetadataDocument, payload, requestType)

      const [publishEventCall] = jest.mocked(publishEvent).mock.calls[0]
      expect(publishEventCall).toMatchObject({
        schemaVersion: AuditEventMessageSchemaVersion.V1,
        category: AuditEventMessageCategory.FORM,
        type: AuditEventMessageType.FORM_UPDATED,
        createdAt: BASE_CREATED_DATE,
        createdBy: author
      })
      expect(publishEventCall.data).toMatchObject({
        requestType,
        s3Meta: undefined,
        slug: formMetadataDocument.slug,
        payload
      })
      expect(publishEventCall).toMatchSnapshot({
        messageCreatedAt: expect.any(Date)
      })
    })
  })

  describe('publishFormDraftReplacedEvent', () => {
    it('should publish a REPLACE_DRAFT event', async () => {
      const s3Meta = {
        fileId: '3HL4kqtJlcpXrof3W3Zz4YBdvdz2FJ9n',
        filename: '6883d8667a2a64da10af4312.json',
        s3Key: 'audit-definitions/6883d8667a2a64da10af4312.json'
      }
      jest.mocked(saveToS3).mockResolvedValue(s3Meta)
      const requestType = FormDefinitionRequestType.REPLACE_DRAFT
      const definition = buildDefinition()
      await publishFormDraftReplacedEvent(formMetadataDocument, definition)

      const [publishEventCall] = jest.mocked(publishEvent).mock.calls[0]
      expect(publishEventCall).toMatchObject({
        schemaVersion: AuditEventMessageSchemaVersion.V1,
        category: AuditEventMessageCategory.FORM,
        type: AuditEventMessageType.FORM_UPDATED,
        createdAt: BASE_CREATED_DATE,
        createdBy: author
      })
      expect(publishEventCall.data).toMatchObject({
        requestType,
        s3Meta,
        slug: formMetadataDocument.slug,
        payload: undefined
      })
      expect(publishEventCall).toMatchSnapshot({
        messageCreatedAt: expect.any(Date)
      })
    })
  })

  describe('bulkPublishEvents', () => {
    it('should publish FORM_ORGANISATION_UPDATED', async () => {
      const message = buildFormOrganisationUpdatedMessage()
      const result = await bulkPublishEvents([message])
      expect(result).toEqual([
        {
          type: AuditEventMessageType.FORM_ORGANISATION_UPDATED,
          messageId: '2888a402-7609-43c5-975f-b1974969cdb6'
        }
      ])
      expect(publishEvent).toHaveBeenCalledWith(message)
      const [publishEventCall] = jest.mocked(publishEvent).mock.calls[0]
      expect(publishEventCall).toMatchSnapshot({
        messageCreatedAt: expect.any(Date)
      })
    })

    it('should fail given rejection', async () => {
      jest.mocked(publishEvent).mockRejectedValue(new Error('an error'))
      const message = buildFormOrganisationUpdatedMessage()

      await expect(bulkPublishEvents([message])).rejects.toThrow()
    })
  })
})
