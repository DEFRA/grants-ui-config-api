import { AuditEventMessageType } from '@defra/forms-model'
import { buildDefinition } from '@defra/forms-model/stubs'
import Boom from '@hapi/boom'
import { MongoServerError, ObjectId } from 'mongodb'
import { pino } from 'pino'

import { buildMetadataDocument } from '~/src/api/forms/__stubs__/metadata.js'
import { InvalidFormDefinitionError } from '~/src/api/forms/errors.js'
import * as formDefinition from '~/src/api/forms/repositories/form-definition-repository.js'
import * as formMetadata from '~/src/api/forms/repositories/form-metadata-repository.js'
import * as formVersions from '~/src/api/forms/repositories/form-versions-repository.js'
import author from '~/src/api/forms/service/__stubs__/author.js'
import {
  formMetadataDocument,
  formMetadataInput,
  formMetadataOutput,
  formMetadataWithLiveDocument
} from '~/src/api/forms/service/__stubs__/service.js'
import { mockFormVersionDocument } from '~/src/api/forms/service/__stubs__/versioning.js'
import { getFormDefinition, updateDraftFormDefinition } from '~/src/api/forms/service/definition.js'
import {
  createForm,
  getForm,
  getFormBySlug,
  prepareUpdatedFormMetadata,
  removeForm,
  updateFormMetadata,
  validateLiveFormTitleUpdate
} from '~/src/api/forms/service/index.js'
import * as versioningService from '~/src/api/forms/service/versioning.js'
import * as formTemplates from '~/src/api/forms/templates.js'
import { publishEvent } from '~/src/messaging/publish-base.js'
import { prepareDb } from '~/src/mongo.js'

jest.mock('~/src/helpers/get-author.js')
jest.mock('~/src/api/forms/repositories/form-definition-repository.js')
jest.mock('~/src/api/forms/repositories/form-metadata-repository.js')
jest.mock('~/src/api/forms/repositories/form-versions-repository.js')
jest.mock('~/src/api/forms/templates.js')
jest.mock('~/src/mongo.js')
jest.mock('~/src/messaging/publish-base.js')
jest.mock('~/src/api/forms/service/versioning.js')

jest.useFakeTimers().setSystemTime(new Date('2020-01-01'))

const { empty: emptyFormWithSummary } = /** @type {typeof formTemplates} */ (
  jest.requireActual('~/src/api/forms/templates.js')
)
const { emptyV2: emptyFormWithSummaryV2 } = /** @type {typeof formTemplates} */ (
  jest.requireActual('~/src/api/forms/templates.js')
)

describe('Forms service', () => {
  const id = '661e4ca5039739ef2902b214'
  const slug = 'test-form'
  const dateUsedInFakeTime = new Date('2020-01-01')
  const messageId = 'ed530a3b-7662-4188-9d01-15dc53167101'

  let definition = emptyFormWithSummary()
  const definitionV2 = emptyFormWithSummaryV2()

  beforeAll(async () => {
    await prepareDb(pino())
  })

  beforeEach(() => {
    definition = emptyFormWithSummary()
    jest.mocked(formMetadata.get).mockResolvedValue(formMetadataDocument)
    jest.mocked(formVersions.getVersionSummaries).mockResolvedValue([])
    jest.mocked(publishEvent).mockResolvedValue({
      MessageId: messageId,
      SequenceNumber: '1',
      $metadata: {}
    })
    jest.mocked(versioningService.createFormVersion).mockResolvedValue(mockFormVersionDocument)
    jest.mocked(versioningService.getLatestFormVersion).mockResolvedValue(mockFormVersionDocument)
  })

  const slugExamples = [
    {
      input: 'Test form',
      output: 'test-form'
    },
    {
      input: 'A !Super! Duper Form -    from Defra...',
      output: 'a-super-duper-form-from-defra'
    }
  ]

  const changeLogs = [
    {
      input: {
        organisation: 'Natural England'
      },
      output: AuditEventMessageType.FORM_ORGANISATION_UPDATED
    }
  ]

  describe('createForm', () => {
    beforeEach(() => {
      jest.mocked(formDefinition.update).mockResolvedValue(buildDefinition())
      jest.mocked(formTemplates.emptyV2).mockReturnValue(definitionV2)
      jest.mocked(formMetadata.create).mockResolvedValue({
        acknowledged: true,
        insertedId: new ObjectId(id)
      })
    })

    it('should create a new form and publish audit event', async () => {
      await expect(createForm(formMetadataInput, author)).resolves.toEqual(formMetadataOutput)
      const publishEventCalls = jest.mocked(publishEvent).mock.calls[0]

      expect(publishEventCalls[0]).toMatchObject({
        type: AuditEventMessageType.FORM_CREATED
      })
    })

    it('should check if form create DB operation is called with correct form data', async () => {
      const dbSpy = jest.spyOn(formMetadata, 'create')

      await createForm(formMetadataInput, author)

      const dbMetadataOperationArgs = dbSpy.mock.calls[0][0]

      expect(dbSpy).toHaveBeenCalled()
      expect(dbMetadataOperationArgs.createdAt).toEqual(dateUsedInFakeTime)
      expect(dbMetadataOperationArgs.createdBy).toEqual(author)
      expect(dbMetadataOperationArgs.updatedBy).toEqual(author)
      expect(dbMetadataOperationArgs.updatedAt).toEqual(dateUsedInFakeTime)
    })

    test.each(slugExamples)(`should return slug '$output'`, async (slugIn) => {
      const input = {
        ...formMetadataInput,
        title: slugIn.input
      }

      expect((await createForm(input, author)).slug).toBe(slugIn.output)
    })

    it('should throw an error when schema validation fails', async () => {
      // @ts-expect-error - Allow invalid form definition for test
      jest.mocked(formTemplates.emptyV2).mockReturnValueOnce({})

      const input = {
        ...formMetadataInput,
        organisation: '',
        teamName: '',
        teamEmail: ''
      }

      await expect(createForm(input, author)).rejects.toThrow(InvalidFormDefinitionError)
    })

    it('should throw an error when writing for metadata fails', async () => {
      jest.mocked(formMetadata.create).mockRejectedValueOnce(new Error())

      const input = {
        ...formMetadataInput,
        organisation: '',
        teamName: '',
        teamEmail: ''
      }

      await expect(createForm(input, author)).rejects.toThrow()
    })

    it('should throw an error when writing form def fails', async () => {
      jest.mocked(formDefinition.update).mockRejectedValueOnce(new Error())

      const input = {
        ...formMetadataInput,
        organisation: '',
        teamName: '',
        teamEmail: ''
      }

      await expect(createForm(input, author)).rejects.toThrow()
    })

    it('should throw error when metadata is not created in transaction', async () => {
      jest.mocked(formMetadata.create).mockRejectedValueOnce(new Error('Failed to create metadata'))

      const input = {
        ...formMetadataInput,
        organisation: 'Test Org',
        teamName: 'Test Team',
        teamEmail: 'test@example.com'
      }

      await expect(createForm(input, author)).rejects.toThrow()
    })

    it('should return the form definition', async () => {
      jest.mocked(formDefinition.get).mockResolvedValueOnce(definition)

      await expect(getFormDefinition('123')).resolves.toMatchObject(definition)
    })

    it('should throw an error if the form associated with the definition does not exist', async () => {
      const error = Boom.notFound("Form with ID '123' not found")

      jest.mocked(formMetadata.get).mockRejectedValue(error)

      await expect(updateDraftFormDefinition('123', definition, author)).rejects.toThrow(error)
    })
  })

  describe('removeForm', () => {
    it('should succeed if both operations succeed and publish', async () => {
      jest.mocked(formMetadata.remove).mockResolvedValueOnce()
      jest.mocked(formDefinition.remove).mockResolvedValueOnce()

      await expect(removeForm(id, author)).resolves.toBeUndefined()
      const [publishCall] = jest.mocked(publishEvent).mock.calls[0]
      expect(publishCall.type).toBe(AuditEventMessageType.FORM_DRAFT_DELETED)
      expect(publishCall.createdBy).toEqual(author)
    })

    it('should fail if form metadata remove fails', async () => {
      jest.mocked(formMetadata.remove).mockRejectedValueOnce('unknown error')
      jest.mocked(formDefinition.remove).mockResolvedValueOnce()

      await expect(removeForm(id, author)).rejects.toBeDefined()
    })

    it('should fail if form definition remove fails', async () => {
      jest.mocked(formMetadata.remove).mockResolvedValueOnce()
      jest.mocked(formDefinition.remove).mockRejectedValueOnce('unknown error')

      await expect(removeForm(id, author)).rejects.toBeDefined()
    })

    it('should fail if the form is live', async () => {
      jest.mocked(formMetadata.get).mockResolvedValueOnce(formMetadataWithLiveDocument)

      await expect(removeForm(id, author)).rejects.toBeDefined()
    })
  })

  describe('getFormBySlug', () => {
    it('should return form metadata with versions when form exists', async () => {
      const mockVersions = [
        { versionNumber: 1, createdAt: new Date('2023-01-01') },
        { versionNumber: 2, createdAt: new Date('2023-02-01') }
      ]

      jest.mocked(formMetadata.getBySlug).mockResolvedValue(formMetadataDocument)
      jest.mocked(formVersions.getVersionSummaries).mockResolvedValue(mockVersions)

      const result = await getFormBySlug(slug)

      expect(result).toEqual({
        ...formMetadataOutput,
        versions: mockVersions
      })
      expect(formMetadata.getBySlug).toHaveBeenCalledWith(slug)
      expect(formVersions.getVersionSummaries).toHaveBeenCalledWith(id)
    })

    it('should throw an error if form does not exist', async () => {
      const error = Boom.notFound(`Form with slug '${slug}' not found`)
      jest.mocked(formMetadata.getBySlug).mockRejectedValue(error)

      await expect(getFormBySlug(slug)).rejects.toThrow(error)
    })
  })

  describe('getForm', () => {
    it('should return form metadata with versions when form exists', async () => {
      const mockVersions = [
        { versionNumber: 1, createdAt: new Date('2023-01-01') },
        { versionNumber: 2, createdAt: new Date('2023-02-01') }
      ]

      jest.mocked(formMetadata.get).mockResolvedValue(formMetadataDocument)
      jest.mocked(formVersions.getVersionSummaries).mockResolvedValue(mockVersions)

      const result = await getForm(id)

      expect(result).toEqual({
        ...formMetadataOutput,
        versions: mockVersions
      })
      expect(formMetadata.get).toHaveBeenCalledWith(id)
      expect(formVersions.getVersionSummaries).toHaveBeenCalledWith(id)
    })

    it('should throw an error if form does not exist', async () => {
      const error = Boom.notFound(`Form with ID '${id}' not found`)
      jest.mocked(formMetadata.get).mockRejectedValue(error)

      await expect(getForm(id)).rejects.toThrow(error)
    })

    it('should handle empty versions array', async () => {
      jest.mocked(formMetadata.get).mockResolvedValue(formMetadataDocument)
      jest.mocked(formVersions.getVersionSummaries).mockResolvedValue([])

      const result = await getForm(id)

      expect(result).toEqual({
        ...formMetadataOutput,
        versions: []
      })
      expect(formVersions.getVersionSummaries).toHaveBeenCalledWith(id)
    })
  })

  describe('updateFormMetadata', () => {
    beforeEach(() => {
      jest.mocked(formMetadata.update).mockResolvedValue(buildMetadataDocument())
      jest.mocked(formDefinition.get).mockResolvedValue(definition)
    })

    it.each(slugExamples)(`should return slug '$output'`, async (slugIn) => {
      const input = {
        ...formMetadataInput,
        title: slugIn.input
      }

      await expect(updateFormMetadata(id, input, author)).resolves.toEqual(slugIn.output)
    })

    it('should update slug, draft.updatedAt/draft.updatedBy and publish FormTitleUpdatedMessage when title is updated', async () => {
      const input = {
        title: 'new title'
      }

      jest.mocked(formMetadata.get).mockResolvedValueOnce(formMetadataDocument)

      const dbMetadataSpy = jest.spyOn(formMetadata, 'update')
      const dbDefinitionSpy = jest.spyOn(formDefinition, 'updateName')

      const updatedSlug = await updateFormMetadata(id, input, author)
      expect(updatedSlug).toBe('new-title')

      const dbMetadataOperationArgs = dbMetadataSpy.mock.calls[0]
      const dbDefinitionOperationArgs = dbDefinitionSpy.mock.calls[0]
      const publishEventCalls = jest.mocked(publishEvent).mock.calls[0]

      // Check metadata was updated
      expect(dbMetadataSpy).toHaveBeenCalled()
      expect(dbMetadataOperationArgs[0]).toBe(id)
      expect(dbMetadataOperationArgs[1]).toMatchObject({
        $set: {
          slug: 'new-title',
          title: input.title,
          updatedAt: dateUsedInFakeTime,
          updatedBy: author,
          'draft.updatedAt': dateUsedInFakeTime,
          'draft.updatedBy': author
        }
      })

      // Check definition was updated
      expect(dbDefinitionSpy).toHaveBeenCalled()
      expect(dbDefinitionOperationArgs[0]).toBe(id)
      expect(dbDefinitionOperationArgs[1]).toBe(input.title)

      // Check that FORM_TITLE_UPDATED event was published
      expect(publishEvent).toHaveBeenCalledTimes(1)
      expect(publishEventCalls[0]).toMatchObject({
        type: AuditEventMessageType.FORM_TITLE_UPDATED,
        data: {
          changes: {
            previous: {
              title: 'Test form'
            },
            new: {
              title: 'new title'
            }
          }
        }
      })
    })

    it('should not update draft.updatedAt and draft.updatedBy when title is not updated', async () => {
      const input = {
        organisation: 'Animal and Plant Health Agency – APHA'
      }

      jest.mocked(formMetadata.get).mockResolvedValueOnce(formMetadataDocument)

      const dbMetadataSpy = jest.spyOn(formMetadata, 'update')
      const dbDefinitionSpy = jest.spyOn(formDefinition, 'updateName')

      const slugAfterUpdate = await updateFormMetadata(id, input, author)
      expect(slugAfterUpdate).toBe('test-form')

      const dbMetadataOperationArgs = dbMetadataSpy.mock.calls[0]

      expect(dbMetadataSpy).toHaveBeenCalled()
      expect(dbMetadataOperationArgs[0]).toBe(id)
      expect(dbMetadataOperationArgs[1]).toMatchObject({
        $set: {
          organisation: 'Animal and Plant Health Agency – APHA',
          updatedAt: dateUsedInFakeTime,
          updatedBy: author
        }
      })

      expect(dbMetadataOperationArgs[1].$set?.['draft.updatedAt']).toBeUndefined()
      expect(dbMetadataOperationArgs[1].$set?.['draft.updatedBy']).toBeUndefined()

      expect(dbDefinitionSpy).not.toHaveBeenCalled()
    })

    it('should throw an error when writing for metadata fails', async () => {
      jest.mocked(formMetadata.update).mockRejectedValue(new Error('error'))

      await expect(updateFormMetadata(id, formMetadataInput, author)).rejects.toThrow('error')
    })

    it('should throw an error if form does not exist', async () => {
      const error = Boom.notFound("Form with ID '123' not found")

      jest.mocked(formMetadata.get).mockRejectedValue(error)

      await expect(updateFormMetadata('123', formMetadataInput, author)).rejects.toThrow(error)
    })

    it('should throw an error if form is live and trying to update title', async () => {
      const error = Boom.badRequest(`Form with ID '123' is live so 'title' cannot be updated`)

      jest.mocked(formMetadata.get).mockResolvedValueOnce(formMetadataWithLiveDocument)

      await expect(updateFormMetadata('123', { title: 'new title' }, author)).rejects.toThrow(error)
    })

    it('should throw an error when title already exists', async () => {
      const duplicateError = new MongoServerError({
        message: 'duplicate key error',
        code: 11000
      })
      jest.mocked(formMetadata.update).mockRejectedValue(duplicateError)

      const input = {
        title: 'duplicate title'
      }

      await expect(updateFormMetadata(id, input, author)).rejects.toThrow(
        Boom.badRequest('Form title duplicate title already exists')
      )
    })
  })

  describe('updateFormMetadataV2', () => {
    beforeEach(() => {
      jest.mocked(formMetadata.update).mockResolvedValue(buildMetadataDocument())
      jest.mocked(formDefinition.get).mockResolvedValue(definitionV2)
    })

    it.each(slugExamples)(`should return slug '$output'`, async (slugIn) => {
      const input = {
        ...formMetadataInput,
        title: slugIn.input
      }

      await expect(updateFormMetadata(id, input, author)).resolves.toEqual(slugIn.output)
    })

    it('should update slug and draft.updatedAt/draft.updatedBy when title is updated', async () => {
      const input = {
        title: 'new title'
      }

      jest.mocked(formMetadata.get).mockResolvedValueOnce(formMetadataDocument)

      const dbMetadataSpy = jest.spyOn(formMetadata, 'update')
      const dbDefinitionSpy = jest.spyOn(formDefinition, 'updateName')

      const updatedSlug = await updateFormMetadata(id, input, author)
      expect(updatedSlug).toBe('new-title')

      const dbMetadataOperationArgs = dbMetadataSpy.mock.calls[0]
      const dbDefinitionOperationArgs = dbDefinitionSpy.mock.calls[0]

      // Check metadata was updated
      expect(dbMetadataSpy).toHaveBeenCalled()
      expect(dbMetadataOperationArgs[0]).toBe(id)
      expect(dbMetadataOperationArgs[1]).toMatchObject({
        $set: {
          slug: 'new-title',
          title: input.title,
          updatedAt: dateUsedInFakeTime,
          updatedBy: author,
          'draft.updatedAt': dateUsedInFakeTime,
          'draft.updatedBy': author
        }
      })

      // Check definition was updated
      expect(dbDefinitionSpy).toHaveBeenCalled()
      expect(dbDefinitionOperationArgs[0]).toBe(id)
      expect(dbDefinitionOperationArgs[1]).toBe(input.title)
    })

    it('should not update draft.updatedAt and draft.updatedBy when title is not updated', async () => {
      const input = {
        organisation: 'Animal and Plant Health Agency – APHA'
      }

      jest.mocked(formMetadata.get).mockResolvedValueOnce(formMetadataDocument)

      const dbMetadataSpy = jest.spyOn(formMetadata, 'update')
      const dbDefinitionSpy = jest.spyOn(formDefinition, 'updateName')

      const slugAfterUpdate = await updateFormMetadata(id, input, author)
      expect(slugAfterUpdate).toBe('test-form')

      const dbMetadataOperationArgs = dbMetadataSpy.mock.calls[0]

      expect(dbMetadataSpy).toHaveBeenCalled()
      expect(dbMetadataOperationArgs[0]).toBe(id)
      expect(dbMetadataOperationArgs[1]).toMatchObject({
        $set: {
          organisation: 'Animal and Plant Health Agency – APHA',
          updatedAt: dateUsedInFakeTime,
          updatedBy: author
        }
      })

      expect(dbMetadataOperationArgs[1].$set?.['draft.updatedAt']).toBeUndefined()
      expect(dbMetadataOperationArgs[1].$set?.['draft.updatedBy']).toBeUndefined()

      expect(dbDefinitionSpy).not.toHaveBeenCalled()
    })

    it('should throw an error when writing for metadata fails', async () => {
      jest.mocked(formMetadata.update).mockRejectedValue(new Error('error'))

      await expect(updateFormMetadata(id, formMetadataInput, author)).rejects.toThrow('error')
    })

    it('should throw an error if form does not exist', async () => {
      const error = Boom.notFound("Form with ID '123' not found")

      jest.mocked(formMetadata.get).mockRejectedValue(error)

      await expect(updateFormMetadata('123', formMetadataInput, author)).rejects.toThrow(error)
    })

    it('should throw an error if form is live and trying to update title', async () => {
      const error = Boom.badRequest(`Form with ID '123' is live so 'title' cannot be updated`)

      jest.mocked(formMetadata.get).mockResolvedValueOnce(formMetadataWithLiveDocument)

      await expect(updateFormMetadata('123', { title: 'new title' }, author)).rejects.toThrow(error)
    })

    it('should throw an error when title already exists', async () => {
      const duplicateError = new MongoServerError({
        message: 'duplicate key error',
        code: 11000
      })
      jest.mocked(formMetadata.update).mockRejectedValue(duplicateError)

      const input = {
        title: 'duplicate title'
      }

      await expect(updateFormMetadata(id, input, author)).rejects.toThrow(
        Boom.badRequest('Form title duplicate title already exists')
      )
    })

    it.each(changeLogs)(`should publish '$output' event`, async (changeLog) => {
      await updateFormMetadata(id, changeLog.input, author)
      const publishEventCalls = jest.mocked(publishEvent).mock.calls[0]

      expect(publishEvent).toHaveBeenCalledTimes(1)
      expect(publishEventCalls[0]).toMatchObject({
        type: changeLog.output
      })
    })
  })

  describe('validateLiveFormTitleUpdate', () => {
    it('should not throw when form is not live', () => {
      const form = {
        ...formMetadataDocument,
        id: formMetadataDocument._id.toString()
      }
      const formUpdate = { title: 'New Title' }

      expect(() => {
        validateLiveFormTitleUpdate(form, 'formId', formUpdate)
      }).not.toThrow()
    })

    it('should throw Boom.badRequest when trying to update live form title', () => {
      const form = {
        ...formMetadataWithLiveDocument,
        id: formMetadataWithLiveDocument._id.toString()
      }
      const formUpdate = { title: 'New Title' }

      expect(() => {
        validateLiveFormTitleUpdate(form, 'formId', formUpdate)
      }).toThrow(Boom.badRequest("Form with ID 'formId' is live so 'title' cannot be updated"))
    })
  })

  describe('prepareUpdatedFormMetadata', () => {
    it('should return form update with audit fields', () => {
      const formUpdate = { organisation: 'New Org' }
      const result = prepareUpdatedFormMetadata(formUpdate, author)

      expect(result).toEqual(
        expect.objectContaining({
          organisation: 'New Org',
          updatedBy: author,
          updatedAt: expect.any(Date)
        })
      )
    })

    it('should add slug when title is provided', () => {
      const formUpdate = { title: 'New Title' }
      const result = prepareUpdatedFormMetadata(formUpdate, author)

      expect(result).toEqual(
        expect.objectContaining({
          title: 'New Title',
          slug: 'new-title',
          updatedBy: author,
          updatedAt: expect.any(Date)
        })
      )
    })
  })

  describe('handleTitleUpdate', () => {
    it('should throw error when title is not provided', async () => {
      const formUpdate = {}
      const updatedForm = { updatedAt: dateUsedInFakeTime }
      const mockSession = /** @type {ClientSession} */ ({})

      const { handleTitleUpdate } = await import('~/src/api/forms/service/index.js')

      await expect(
        handleTitleUpdate(
          id,
          { ...formMetadataDocument, id: formMetadataDocument._id.toString() },
          formUpdate,
          updatedForm,
          mockSession
        )
      ).rejects.toThrow('Title is required for title update')
    })
  })

  describe('handleMetadataVersioning', () => {
    it('should not create version when there are no changes', async () => {
      const formUpdate = {}
      const mockSession = /** @type {import('mongodb').ClientSession} */ ({})

      jest.clearAllMocks()

      const { handleMetadataVersioning } = await import('~/src/api/forms/service/index.js')

      await handleMetadataVersioning(id, formUpdate, mockSession)

      expect(versioningService.createFormVersion).not.toHaveBeenCalled()
    })
  })
})

/**
 * @import { ClientSession } from 'mongodb'
 */
