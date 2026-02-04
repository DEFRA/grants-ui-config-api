import {
  Engine,
  FormStatus,
  formDefinitionSchema,
  formDefinitionV2Schema
} from '@defra/forms-model'
import {
  buildDefinition,
  buildQuestionPage,
  buildSummaryPage,
  buildTextFieldComponent
} from '@defra/forms-model/stubs'
import Boom from '@hapi/boom'
import { ObjectId } from 'mongodb'
import { pino } from 'pino'

import { buildMetadataDocument } from '~/src/api/forms/__stubs__/metadata.js'
import { makeFormLiveErrorMessages } from '~/src/api/forms/constants.js'
import { InvalidFormDefinitionError } from '~/src/api/forms/errors.js'
import * as formDefinition from '~/src/api/forms/repositories/form-definition-repository.js'
import * as formMetadata from '~/src/api/forms/repositories/form-metadata-repository.js'
import { MAX_RESULTS } from '~/src/api/forms/repositories/form-metadata-repository.js'
import * as formVersions from '~/src/api/forms/repositories/form-versions-repository.js'
import {
  modifyReorderComponents,
  modifyReorderPages
} from '~/src/api/forms/repositories/helpers.js'
import {
  formMetadataDocument,
  formMetadataInput,
  formMetadataOutput,
  formMetadataWithLiveDocument,
  mockFilters
} from '~/src/api/forms/service/__stubs__/service.js'
import { mockFormVersionDocument } from '~/src/api/forms/service/__stubs__/versioning.js'
import {
  createDraftFromLive,
  createLiveFromDraft,
  deleteDraftFormDefinition,
  getFormDefinition,
  listForms,
  reorderDraftFormDefinitionComponents,
  reorderDraftFormDefinitionPages,
  updateDraftFormDefinition
} from '~/src/api/forms/service/definition.js'
import {
  createForm,
  getFormBySlug,
  removeForm
} from '~/src/api/forms/service/index.js'
import * as versioningService from '~/src/api/forms/service/versioning.js'
import * as formTemplates from '~/src/api/forms/templates.js'
import { getAuthor } from '~/src/helpers/get-author.js'
import { saveToS3 } from '~/src/messaging/s3.js'
import { prepareDb } from '~/src/mongo.js'

jest.mock('~/src/helpers/get-author.js')
jest.mock('~/src/api/forms/repositories/form-definition-repository.js')
jest.mock('~/src/api/forms/repositories/form-metadata-repository.js')
jest.mock('~/src/api/forms/repositories/form-versions-repository.js')
jest.mock('~/src/api/forms/templates.js')
jest.mock('~/src/mongo.js')
jest.mock('~/src/messaging/s3.js')
jest.mock('~/src/api/forms/service/versioning.js')

jest.useFakeTimers().setSystemTime(new Date('2020-01-01'))

const { empty: emptyFormWithSummary } = /** @type {typeof formTemplates} */ (
  jest.requireActual('~/src/api/forms/templates.js')
)
const { emptyV2: emptyFormWithSummaryV2 } =
  /** @type {typeof formTemplates} */ (
    jest.requireActual('~/src/api/forms/templates.js')
  )
const author = getAuthor()

describe('Forms service', () => {
  const id = '661e4ca5039739ef2902b214'
  const slug = 'test-form'
  const dateUsedInFakeTime = new Date('2020-01-01')

  let definition = emptyFormWithSummary()
  const definitionV2 = emptyFormWithSummaryV2()

  const dbMetadataSpy = jest.spyOn(formMetadata, 'updateAudit')

  const expectMetadataUpdate = () => {
    expect(dbMetadataSpy).toHaveBeenCalled()
    const [formId, updateFilter] = dbMetadataSpy.mock.calls[0]
    expect(formId).toBe(id)
    expect(updateFilter).toEqual(author)
  }

  beforeAll(async () => {
    await prepareDb(pino())
  })

  beforeEach(() => {
    definition = emptyFormWithSummary()
    jest.mocked(formMetadata.get).mockResolvedValue(formMetadataDocument)
    jest.mocked(formVersions.getVersionSummaries).mockResolvedValue([])
    jest
      .mocked(formMetadata.updateAudit)
      .mockResolvedValue(formMetadataDocument)
    jest
      .mocked(versioningService.createFormVersion)
      .mockResolvedValue(mockFormVersionDocument)
    jest
      .mocked(versioningService.getLatestFormVersion)
      .mockResolvedValue(mockFormVersionDocument)
  })

  describe('createDraftFromLive', () => {
    beforeEach(() => {
      jest.mocked(formDefinition.createDraftFromLive).mockResolvedValueOnce()
      jest
        .mocked(formMetadata.update)
        .mockResolvedValueOnce(buildMetadataDocument())
    })

    it("should throw bad request if there's no live definition", async () => {
      jest.mocked(formMetadata.get).mockResolvedValueOnce(formMetadataDocument)

      await expect(createDraftFromLive(id, author)).rejects.toThrow(
        Boom.badRequest(
          `Form with ID '${formMetadataWithLiveDocument._id.toString()}' has no live state`
        )
      )
    })

    it('should update the form state when creating', async () => {
      jest
        .mocked(formMetadata.get)
        .mockResolvedValue(formMetadataWithLiveDocument)

      const dbSpy = jest.spyOn(formMetadata, 'update')

      await createDraftFromLive(id, author)

      const dbMetadataOperationArgs = dbSpy.mock.calls[0]

      expect(dbSpy).toHaveBeenCalled()
      expect(dbMetadataOperationArgs[0]).toBe(id)
      expect(dbMetadataOperationArgs[1].$set).toMatchObject({
        draft: {
          createdAt: dateUsedInFakeTime,
          createdBy: author,
          updatedAt: dateUsedInFakeTime,
          updatedBy: author
        },
        updatedAt: dateUsedInFakeTime,
        updatedBy: author
      })
    })
  })

  describe('createLiveFromDraft', () => {
    beforeEach(() => {
      jest.mocked(formDefinition.createLiveFromDraft).mockResolvedValue()
      jest
        .mocked(formMetadata.update)
        .mockResolvedValue(buildMetadataDocument())
    })

    it('should create a live state from existing draft form V1', async () => {
      jest.mocked(formDefinition.get).mockResolvedValueOnce({
        ...definition,
        outputEmail: 'test@defra.gov.uk'
      })
      await expect(createLiveFromDraft(id, author)).resolves.toBeUndefined()
    })

    it('should create a live state from existing draft form V2', async () => {
      jest.mocked(formDefinition.get).mockResolvedValueOnce({
        ...definitionV2,
        outputEmail: 'test@defra.gov.uk'
      })
      await expect(createLiveFromDraft(id, author)).resolves.toBeUndefined()
    })

    it('should check if form update DB operation is called with correct form data', async () => {
      jest.mocked(formDefinition.get).mockResolvedValueOnce({
        ...definition,
        outputEmail: 'test@defra.gov.uk'
      })

      const dbSpy = jest.spyOn(formMetadata, 'update')

      await createLiveFromDraft('123', author)

      const dbMetadataOperationArgs = dbSpy.mock.calls[0]

      expect(dbSpy).toHaveBeenCalled()
      expect(dbMetadataOperationArgs[0]).toBe('123')
      expect(dbMetadataOperationArgs[1].$set?.live).toEqual({
        createdAt: dateUsedInFakeTime,
        createdBy: author,
        updatedAt: dateUsedInFakeTime,
        updatedBy: author
      })
      expect(dbMetadataOperationArgs[1].$set?.updatedAt).toEqual(
        dateUsedInFakeTime
      )
      expect(dbMetadataOperationArgs[1].$set?.updatedBy).toEqual(author)
    })

    it('should fail to create a live state from existing draft form when there is no start page', async () => {
      const draftDefinitionNoStartPage = /** @type {FormDefinition} */ (
        definition
      )
      delete draftDefinitionNoStartPage.startPage

      jest
        .mocked(formDefinition.get)
        .mockResolvedValueOnce(draftDefinitionNoStartPage)

      await expect(createLiveFromDraft(id, author)).rejects.toThrow(
        Boom.badRequest(makeFormLiveErrorMessages.missingStartPage)
      )
    })

    it('should fail to create a live state from existing draft form when there is no output email', async () => {
      const draftDefinitionNoOutputEmail = /** @type {FormDefinition} */ (
        definition
      )
      delete draftDefinitionNoOutputEmail.outputEmail

      const metadataNoNotificationEmail = {
        .../** @type {WithId<FormMetadataDocument>} */ (formMetadataDocument)
      }
      delete metadataNoNotificationEmail.notificationEmail

      jest
        .mocked(formDefinition.get)
        .mockResolvedValue(draftDefinitionNoOutputEmail)

      jest
        .mocked(formMetadata.get)
        .mockResolvedValueOnce(metadataNoNotificationEmail)

      await expect(createLiveFromDraft(id, author)).rejects.toThrow(
        Boom.badRequest(makeFormLiveErrorMessages.missingOutputEmail)
      )
    })

    it('should fail to create a live state from existing draft form when there is no contact', async () => {
      const metadataNoContact = {
        .../** @type {WithId<FormMetadataDocument>} */ (formMetadataDocument)
      }

      delete metadataNoContact.contact
      jest.mocked(formMetadata.get).mockResolvedValue(metadataNoContact)

      jest
        .mocked(formDefinition.get)
        .mockResolvedValueOnce(/** @type {FormDefinition} */ (definition))

      await expect(createLiveFromDraft(id, author)).rejects.toThrow(
        Boom.badRequest(makeFormLiveErrorMessages.missingContact)
      )
    })

    it('should fail to create a live state from existing draft form when there is no submission guidance', async () => {
      const metadataNoSubmissionGuidance = {
        .../** @type {WithId<FormMetadataDocument>} */ (formMetadataDocument)
      }

      delete metadataNoSubmissionGuidance.submissionGuidance
      jest
        .mocked(formMetadata.get)
        .mockResolvedValue(metadataNoSubmissionGuidance)

      jest
        .mocked(formDefinition.get)
        .mockResolvedValueOnce(/** @type {FormDefinition} */ (definition))

      await expect(createLiveFromDraft(id, author)).rejects.toThrow(
        Boom.badRequest(makeFormLiveErrorMessages.missingSubmissionGuidance)
      )
    })

    it('should fail to create a live state from existing draft form when there is no privacy notice url', async () => {
      const metadataNoPrivacyNotice = {
        .../** @type {WithId<FormMetadataDocument>} */ (formMetadataDocument)
      }

      delete metadataNoPrivacyNotice.privacyNoticeUrl
      jest.mocked(formMetadata.get).mockResolvedValue(metadataNoPrivacyNotice)

      jest
        .mocked(formDefinition.get)
        .mockResolvedValueOnce(/** @type {FormDefinition} */ (definition))

      await expect(createLiveFromDraft(id, author)).rejects.toThrow(
        Boom.badRequest(makeFormLiveErrorMessages.missingPrivacyNotice)
      )
    })

    it('should fail to create a live state when there is no draft state', async () => {
      /** @type {WithId<FormMetadataDocument>} */
      const formMetadataWithoutDraft = {
        ...formMetadataDocument,
        draft: undefined
      }

      jest
        .mocked(formMetadata.get)
        .mockResolvedValueOnce(formMetadataWithoutDraft)

      await expect(createLiveFromDraft(id, author)).rejects.toThrow(
        Boom.badRequest(makeFormLiveErrorMessages.missingDraft)
      )
    })

    it('should succeed to create a live state from existing draft form when there is no start page when engine is V2', async () => {
      const draftV2DefinitionNoStartPage = /** @type {FormDefinition} */ ({
        ...definition,
        engine: Engine.V2
      })
      delete draftV2DefinitionNoStartPage.startPage

      jest
        .mocked(formDefinition.get)
        .mockResolvedValueOnce(draftV2DefinitionNoStartPage)

      await expect(createLiveFromDraft(id, author)).resolves.toBeUndefined()
    })
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

  describe('createForm', () => {
    beforeEach(() => {
      jest.mocked(formDefinition.update).mockResolvedValue(buildDefinition())
      jest.mocked(formTemplates.emptyV2).mockReturnValue(definitionV2)
      jest.mocked(formMetadata.create).mockResolvedValue({
        acknowledged: true,
        insertedId: new ObjectId(id)
      })
    })

    it('should create a new form', async () => {
      await expect(createForm(formMetadataInput, author)).resolves.toEqual(
        formMetadataOutput
      )
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

      await expect(createForm(input, author)).rejects.toThrow(
        InvalidFormDefinitionError
      )
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

    it('should return the form definition', async () => {
      jest.mocked(formDefinition.get).mockResolvedValueOnce(definition)

      await expect(getFormDefinition('123')).resolves.toMatchObject(definition)
    })

    it('should throw an error if the form associated with the definition does not exist', async () => {
      const error = Boom.notFound("Form with ID '123' not found")

      jest.mocked(formMetadata.get).mockRejectedValue(error)

      await expect(
        updateDraftFormDefinition('123', definition, author)
      ).rejects.toThrow(error)
    })
  })

  describe('removeForm', () => {
    it('should succeed if both operations succeed', async () => {
      jest.mocked(formMetadata.remove).mockResolvedValueOnce()
      jest.mocked(formDefinition.remove).mockResolvedValueOnce()

      await expect(removeForm(id, author)).resolves.toBeUndefined()
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
      jest
        .mocked(formMetadata.get)
        .mockResolvedValueOnce(formMetadataWithLiveDocument)

      await expect(removeForm(id, author)).rejects.toBeDefined()
    })
  })

  describe('listForms', () => {
    const formDate = new Date('2024-01-26T00:00:00Z')
    const liveDate = new Date('2024-02-26T00:00:00Z')
    const draftDate = new Date('2024-03-26T00:00:00Z')
    const defaultDate = new Date('2024-06-25T23:00:00Z')
    const defaultPage = 1
    const defaultPerPage = MAX_RESULTS

    const formAuthor = { displayName: 'Joe Bloggs', id: '1' }
    const liveAuthor = { displayName: 'Jane Doe', id: '2' }
    const draftAuthor = { displayName: 'Enrique Chase', id: '3' }
    const defaultAuthor = { displayName: 'Unknown', id: '-1' }

    /**
     * @type {WithId<Partial<FormMetadataDocument>>}
     */
    const formMetadataBaseDocument = {
      ...formMetadataInput,
      _id: new ObjectId(id),
      slug: formMetadataOutput.slug
    }

    /**
     * @type {WithId<Partial<FormMetadataDocument>>}
     */
    const formMetadataLiveDocument = {
      ...formMetadataBaseDocument,
      live: {
        createdAt: liveDate,
        createdBy: liveAuthor,
        updatedAt: liveDate,
        updatedBy: liveAuthor
      }
    }

    /**
     * @type {WithId<Partial<FormMetadataDocument>>}
     */
    const formMetadataDraftDocument = {
      ...formMetadataLiveDocument,
      draft: {
        createdAt: draftDate,
        createdBy: draftAuthor,
        updatedAt: draftDate,
        updatedBy: draftAuthor
      }
    }

    /**
     * @type {WithId<Partial<FormMetadataDocument>>}
     */
    const formMetadataDraftNoLiveDocument = {
      ...formMetadataBaseDocument,
      draft: {
        createdAt: draftDate,
        createdBy: draftAuthor,
        updatedAt: draftDate,
        updatedBy: draftAuthor
      }
    }

    /**
     * @type {WithId<Partial<FormMetadataDocument>>}
     */
    const formMetadataFullDocument = {
      ...formMetadataDraftDocument,
      createdAt: formDate,
      createdBy: formAuthor,
      updatedAt: formDate,
      updatedBy: formAuthor
    }

    it('should handle the full set of states', async () => {
      jest.mocked(formMetadata.list).mockResolvedValue({
        documents: [formMetadataFullDocument],
        totalItems: 1,
        filters: mockFilters
      })

      const result = await listForms({ page: 1, perPage: 10 })

      expect(result).toEqual({
        forms: [
          expect.objectContaining({
            updatedAt: formDate,
            updatedBy: formAuthor,
            createdAt: formDate,
            createdBy: formAuthor
          })
        ],
        totalItems: 1,
        filters: mockFilters
      })
    })

    it('should handle states when root state info is missing and live is present', async () => {
      jest.mocked(formMetadata.list).mockResolvedValue({
        documents: [formMetadataDraftDocument],
        totalItems: 1,
        filters: mockFilters
      })

      const result = await listForms({ page: 1, perPage: 10 })

      expect(result).toEqual({
        forms: [
          expect.objectContaining({
            updatedAt: draftDate,
            updatedBy: draftAuthor,
            createdAt: liveDate,
            createdBy: liveAuthor
          })
        ],
        totalItems: 1,
        filters: mockFilters
      })
    })

    it('should handle states when draft state info is missing', async () => {
      jest.mocked(formMetadata.list).mockResolvedValue({
        documents: [formMetadataLiveDocument],
        totalItems: 1,
        filters: mockFilters
      })

      const result = await listForms({ page: 1, perPage: 10 })

      expect(result).toEqual({
        forms: [
          expect.objectContaining({
            updatedAt: liveDate,
            updatedBy: liveAuthor,
            createdAt: liveDate,
            createdBy: liveAuthor
          })
        ],
        totalItems: 1,
        filters: mockFilters
      })
    })

    it('should handle states when live state info is missing', async () => {
      jest.mocked(formMetadata.list).mockResolvedValue({
        documents: [formMetadataDraftNoLiveDocument],
        totalItems: 1,
        filters: mockFilters
      })

      const result = await listForms({ page: 1, perPage: 10 })

      expect(result).toEqual({
        forms: [
          expect.objectContaining({
            updatedAt: draftDate,
            updatedBy: draftAuthor,
            createdAt: draftDate,
            createdBy: draftAuthor
          })
        ],
        totalItems: 1,
        filters: mockFilters
      })
    })

    it('should handle states when all states are missing', async () => {
      jest.mocked(formMetadata.list).mockResolvedValue({
        documents: [formMetadataBaseDocument],
        totalItems: 1,
        filters: mockFilters
      })

      const result = await listForms({ page: 1, perPage: 10 })

      expect(result).toEqual({
        forms: [
          expect.objectContaining({
            updatedAt: defaultDate,
            updatedBy: defaultAuthor,
            createdAt: defaultDate,
            createdBy: defaultAuthor
          })
        ],
        totalItems: 1,
        filters: mockFilters
      })
    })

    describe('with sorting', () => {
      it('should pass sorting parameters to repository', async () => {
        const page = 1
        const perPage = 10
        const sortBy = 'title'
        const order = 'asc'
        const title = 'test'
        const totalItems = 3

        const documents = [
          { ...formMetadataFullDocument },
          { ...formMetadataFullDocument },
          { ...formMetadataFullDocument }
        ]

        jest
          .mocked(formMetadata.list)
          .mockResolvedValue({ documents, totalItems, filters: mockFilters })

        const options = { page, perPage, sortBy, order, title }
        const result = await listForms(options)

        expect(formMetadata.list).toHaveBeenCalledWith(options)
        expect(result).toEqual({
          forms: expect.any(Array),
          totalItems,
          filters: mockFilters
        })
      })
    })

    describe('with search', () => {
      it('should pass search parameters to repository', async () => {
        const page = 1
        const perPage = 10
        const title = 'a search'

        jest.mocked(formMetadata.list).mockResolvedValue({
          documents: [formMetadataFullDocument, formMetadataFullDocument],
          totalItems: 2,
          filters: mockFilters
        })

        const result = await listForms({ page, perPage, title })

        expect(formMetadata.list).toHaveBeenCalledWith({
          page,
          perPage,
          title
        })
        expect(result).toEqual({
          forms: expect.any(Array),
          totalItems: 2,
          filters: mockFilters
        })
      })

      it('should return empty results when search finds no matches', async () => {
        const page = 1
        const perPage = 10
        const title = 'Defra Badger Relocation and Tea Party Planning Form'

        jest.mocked(formMetadata.list).mockResolvedValue({
          documents: [],
          totalItems: 0,
          filters: mockFilters
        })

        const result = await listForms({ page, perPage, title })

        expect(formMetadata.list).toHaveBeenCalledWith({
          page,
          perPage,
          title
        })
        expect(result).toEqual({
          forms: [],
          totalItems: 0,
          filters: mockFilters
        })
      })

      it('should use empty string for title when no search parameter is provided', async () => {
        const page = 1
        const perPage = 10

        jest.mocked(formMetadata.list).mockResolvedValue({
          documents: [formMetadataFullDocument],
          totalItems: 1,
          filters: mockFilters
        })

        const result = await listForms({ page, perPage })

        expect(formMetadata.list).toHaveBeenCalledWith({
          page,
          perPage
        })
        expect(result).toEqual({
          forms: expect.any(Array),
          totalItems: 1,
          filters: mockFilters
        })
      })
    })

    it('should handle default pagination parameters', async () => {
      jest.mocked(formMetadata.list).mockResolvedValue({
        documents: [formMetadataFullDocument],
        totalItems: 1,
        filters: mockFilters
      })

      const result = await listForms({
        page: defaultPage,
        perPage: defaultPerPage
      })

      expect(formMetadata.list).toHaveBeenCalledWith({
        page: defaultPage,
        perPage: defaultPerPage
      })
      expect(result).toEqual({
        forms: [
          expect.objectContaining({
            updatedAt: formDate,
            updatedBy: formAuthor,
            createdAt: formDate,
            createdBy: formAuthor
          })
        ],
        totalItems: 1,
        filters: mockFilters
      })
    })

    it('should return correct pagination with MAX_RESULTS', async () => {
      const totalItems = MAX_RESULTS + 1

      jest.mocked(formMetadata.list).mockResolvedValue({
        documents: [formMetadataFullDocument],
        totalItems,
        filters: mockFilters
      })

      const result = await listForms({
        page: defaultPage,
        perPage: defaultPerPage
      })

      expect(result).toEqual({
        forms: [
          expect.objectContaining({
            updatedAt: formDate,
            updatedBy: formAuthor,
            createdAt: formDate,
            createdBy: formAuthor
          })
        ],
        totalItems,
        filters: mockFilters
      })
    })

    it('should handle empty results with MAX_RESULTS', async () => {
      jest.mocked(formMetadata.list).mockResolvedValue({
        documents: [],
        totalItems: 0,
        filters: mockFilters
      })

      const result = await listForms({
        page: defaultPage,
        perPage: defaultPerPage
      })

      expect(result).toEqual({
        forms: [],
        totalItems: 0,
        filters: mockFilters
      })
    })

    it('should use default values when no options are provided', async () => {
      jest.mocked(formMetadata.list).mockResolvedValue({
        documents: [formMetadataFullDocument],
        totalItems: 1,
        filters: mockFilters
      })

      const result = await listForms({ page: 1, perPage: MAX_RESULTS })

      expect(formMetadata.list).toHaveBeenCalledWith({
        page: 1,
        perPage: MAX_RESULTS
      })
      expect(result).toEqual({
        forms: [
          expect.objectContaining({
            updatedAt: formDate,
            updatedBy: formAuthor,
            createdAt: formDate,
            createdBy: formAuthor
          })
        ],
        totalItems: 1,
        filters: mockFilters
      })
    })

    describe('with filters', () => {
      it('should return empty filters when no forms exist', async () => {
        const emptyFilters = {
          authors: [],
          organisations: [],
          status: []
        }

        jest.mocked(formMetadata.list).mockResolvedValue({
          documents: [],
          totalItems: 0,
          filters: emptyFilters
        })

        const result = await listForms({ page: 1, perPage: 10 })

        expect(result).toEqual({
          forms: [],
          totalItems: 0,
          filters: emptyFilters
        })
      })

      it('should pass filter parameters to repository', async () => {
        /** @type {QueryOptions} */
        const options = {
          page: 1,
          perPage: 10,
          author: 'Henrique Chase',
          organisations: ['Defra'],
          status: [FormStatus.Live]
        }

        jest.mocked(formMetadata.list).mockResolvedValue({
          documents: [formMetadataFullDocument],
          totalItems: 1,
          filters: mockFilters
        })

        const result = await listForms(options)

        expect(formMetadata.list).toHaveBeenCalledWith(options)
        expect(result).toEqual({
          forms: expect.any(Array),
          totalItems: 1,
          filters: mockFilters
        })
      })

      it('should handle multiple filter parameters', async () => {
        /** @type {QueryOptions} */
        const options = {
          page: 1,
          perPage: 10,
          author: 'Henrique Chase',
          organisations: ['Defra', 'Natural England'],
          status: [FormStatus.Live, FormStatus.Draft]
        }

        jest.mocked(formMetadata.list).mockResolvedValue({
          documents: [formMetadataFullDocument, formMetadataFullDocument],
          totalItems: 2,
          filters: mockFilters
        })

        const result = await listForms(options)

        expect(formMetadata.list).toHaveBeenCalledWith(options)
        expect(result).toEqual({
          forms: expect.any(Array),
          totalItems: 2,
          filters: mockFilters
        })
      })
    })
  })

  describe('getFormBySlug', () => {
    it('should return form metadata when form exists', async () => {
      jest
        .mocked(formMetadata.getBySlug)
        .mockResolvedValue(formMetadataDocument)

      const result = await getFormBySlug(slug)

      expect(result).toEqual(formMetadataOutput)
      expect(formMetadata.getBySlug).toHaveBeenCalledWith(slug)
    })

    it('should throw an error if form does not exist', async () => {
      const error = Boom.notFound(`Form with slug '${slug}' not found`)
      jest.mocked(formMetadata.getBySlug).mockRejectedValue(error)

      await expect(getFormBySlug(slug)).rejects.toThrow(error)
    })
  })

  describe('updateDraftFormDefinition', () => {
    const s3Meta = {
      fileId: '1111',
      filename: 'definition.json',
      s3Key: 'dir/definition.json'
    }
    beforeEach(() => {
      jest.mocked(saveToS3).mockResolvedValue(s3Meta)
    })
    const formDefinitionCustomisedTitle = emptyFormWithSummary()
    formDefinitionCustomisedTitle.name =
      "A custom form name that shouldn't be allowed"

    it('should update the draft form definition with required attributes upon creation', async () => {
      const updateSpy = jest.spyOn(formDefinition, 'update')
      const formMetadataGetSpy = jest.spyOn(formMetadata, 'get')
      jest.mocked(saveToS3).mockResolvedValue(s3Meta)

      await updateDraftFormDefinition(
        '123',
        formDefinitionCustomisedTitle,
        author
      )

      expect(updateSpy).toHaveBeenCalledWith(
        '123',
        {
          ...formDefinitionCustomisedTitle,
          name: formMetadataDocument.title
        },
        expect.anything(),
        formDefinitionSchema
      )

      expect(formMetadataGetSpy).toHaveBeenCalledWith('123')

      expect(formDefinitionCustomisedTitle.name).toBe(
        formMetadataDocument.title
      )
      expect(saveToS3).toHaveBeenCalledWith(
        '123.json',
        expect.objectContaining({
          ...formDefinitionCustomisedTitle,
          name: formMetadataDocument.title
        })
      )
    })

    it('should use V2 schema when form definition has schema version 2 (regardless of engine)', async () => {
      const v2FormDefinition = {
        ...emptyFormWithSummary(),
        schema: 2
      }

      const updateSpy = jest.spyOn(formDefinition, 'update')

      await updateDraftFormDefinition('123', v2FormDefinition, author)

      expect(updateSpy).toHaveBeenCalledWith(
        '123',
        {
          ...v2FormDefinition,
          name: formMetadataDocument.title
        },
        expect.anything(),
        formDefinitionV2Schema
      )
    })

    it('should use V1 schema when form definition has schema version 1', async () => {
      const v1FormDefinition = {
        ...emptyFormWithSummary(),
        schema: 1
      }

      const updateSpy = jest.spyOn(formDefinition, 'update')

      await updateDraftFormDefinition('123', v1FormDefinition, author)

      expect(updateSpy).toHaveBeenCalledWith(
        '123',
        {
          ...v1FormDefinition,
          name: formMetadataDocument.title
        },
        expect.anything(),
        formDefinitionSchema
      )
    })

    it('should use V1 schema by default when no engine or schema specified', async () => {
      const defaultFormDefinition = emptyFormWithSummary()

      const updateSpy = jest.spyOn(formDefinition, 'update')

      await updateDraftFormDefinition('123', defaultFormDefinition, author)

      expect(updateSpy).toHaveBeenCalledWith(
        '123',
        {
          ...defaultFormDefinition,
          name: formMetadataDocument.title
        },
        expect.anything(),
        formDefinitionSchema
      )
    })

    test('should check if form update DB operation is called with correct form data', async () => {
      const dbSpy = jest.spyOn(formMetadata, 'updateAudit')

      await updateDraftFormDefinition(
        '123',
        formDefinitionCustomisedTitle,
        author
      )

      const dbOperationArgs = dbSpy.mock.calls[0]

      expect(dbSpy).toHaveBeenCalled()
      expect(dbOperationArgs[0]).toBe('123')
      expect(dbOperationArgs[1]).toEqual(author)
    })

    it('should throw an error if the form has no draft state', async () => {
      jest.mocked(formMetadata.get).mockResolvedValueOnce({
        ...formMetadataDocument,
        draft: undefined
      })

      const formDefinitionCustomised = emptyFormWithSummary()

      await expect(
        updateDraftFormDefinition('123', formDefinitionCustomised, author)
      ).rejects.toThrow(
        Boom.badRequest(`Form with ID '123' has no draft state`)
      )
    })
  })

  describe('reorderDraftFormDefinitionPages', () => {
    const pageOneId = 'e6511b1c-c813-43d7-92c4-d84ba35d5f62'
    const pageTwoId = 'e3a1cb1e-8c9e-41d7-8ba7-719829bce84a'
    const summaryPageId = 'b90e6453-d4c1-46a4-a233-3dbee566c79e'

    const pageOne = buildQuestionPage({
      id: pageOneId,
      title: 'Page One'
    })
    const pageTwo = buildQuestionPage({
      id: pageTwoId,
      title: 'Page Two'
    })
    const summaryPage = buildSummaryPage({
      id: summaryPageId
    })

    const definition = buildDefinition({
      pages: [pageTwo, pageOne, summaryPage]
    })

    beforeEach(() => {
      jest.mocked(formDefinition.get).mockResolvedValueOnce(definition)
    })

    it('should reorder the pages', async () => {
      const orderList = [pageOneId, pageOneId]
      jest
        .mocked(formDefinition.reorderPages)
        .mockResolvedValueOnce(modifyReorderPages(definition, orderList))
      const expectedDefinition = buildDefinition({
        pages: [pageOne, pageTwo, summaryPage]
      })
      const result = await reorderDraftFormDefinitionPages(
        id,
        orderList,
        author
      )

      const [, order] = jest.mocked(formDefinition.reorderPages).mock.calls[0]
      expect(order).toEqual(orderList)
      expect(result).toEqual(expectedDefinition)

      expectMetadataUpdate()
    })

    it('should not do any updates if no order list is sent', async () => {
      const returnedDefinition = await reorderDraftFormDefinitionPages(
        id,
        [],
        author
      )
      expect(returnedDefinition).toEqual(definition)
      expect(formDefinition.update).not.toHaveBeenCalled()
      expect(formMetadata.update).not.toHaveBeenCalled()
    })

    it('should surface errors', async () => {
      const boomInternal = Boom.internal('Something went wrong')
      jest
        .mocked(formDefinition.reorderPages)
        .mockRejectedValueOnce(boomInternal)
      await expect(
        reorderDraftFormDefinitionPages(
          id,
          ['5a1c2ef7-ed4e-4ec7-9119-226fc3063bda'],
          author
        )
      ).rejects.toThrow(boomInternal)
    })
  })

  describe('reorderDraftFormDefinitionComponents', () => {
    const componentOneId = 'e6511b1c-c813-43d7-92c4-d84ba35d5f62'
    const componentTwoId = 'e3a1cb1e-8c9e-41d7-8ba7-719829bce84a'
    const componentThreeId = 'b90e6453-d4c1-46a4-a233-3dbee566c79e'
    const pageOneId = '0ac3b3e8-422e-4253-a7a9-506d3234e12f'
    const summaryPageId = 'b90e6453-d4c1-46a4-a233-3dbee566c79e'

    const pageOne = buildQuestionPage({
      id: pageOneId,
      title: 'Page One',
      components: [
        buildTextFieldComponent({
          id: componentOneId,
          title: 'Question 1'
        }),
        buildTextFieldComponent({
          id: componentTwoId,
          title: 'Question 2'
        }),
        buildTextFieldComponent({
          id: componentThreeId,
          title: 'Question 3'
        })
      ]
    })

    const summaryPage = buildSummaryPage({
      id: summaryPageId
    })

    const definition = buildDefinition({
      pages: [pageOne, summaryPage]
    })

    beforeEach(() => {
      jest.mocked(formDefinition.get).mockResolvedValueOnce(definition)
    })

    it('should reorder the components', async () => {
      const orderList = [componentTwoId, componentThreeId, componentOneId]
      jest
        .mocked(formDefinition.reorderComponents)
        .mockResolvedValueOnce(
          modifyReorderComponents(definition, pageOneId, orderList)
        )

      const expectedPageOne = buildQuestionPage({
        id: pageOneId,
        title: 'Page One',
        components: [
          buildTextFieldComponent({
            id: componentTwoId,
            title: 'Question 2'
          }),
          buildTextFieldComponent({
            id: componentThreeId,
            title: 'Question 3'
          }),
          buildTextFieldComponent({
            id: componentOneId,
            title: 'Question 1'
          })
        ]
      })

      const expectedDefinition = buildDefinition({
        pages: [expectedPageOne, summaryPage]
      })
      const result = await reorderDraftFormDefinitionComponents(
        id,
        pageOneId,
        orderList,
        author
      )

      const [, , order] = jest.mocked(formDefinition.reorderComponents).mock
        .calls[0]
      expect(order).toEqual(orderList)
      expect(result).toEqual(expectedDefinition)
      expectMetadataUpdate()
    })

    it('should not do any updates if no order list is sent', async () => {
      const returnedDefinition = await reorderDraftFormDefinitionComponents(
        id,
        pageOneId,
        [],
        author
      )
      expect(returnedDefinition).toEqual(definition)
      expect(formDefinition.update).not.toHaveBeenCalled()
      expect(formMetadata.update).not.toHaveBeenCalled()
    })

    it('should surface errors', async () => {
      const boomInternal = Boom.internal('Something went wrong')
      jest
        .mocked(formDefinition.reorderComponents)
        .mockRejectedValueOnce(boomInternal)
      await expect(
        reorderDraftFormDefinitionComponents(
          id,
          pageOneId,
          [componentOneId, componentTwoId, componentThreeId],
          author
        )
      ).rejects.toThrow(boomInternal)
    })
  })

  describe('deleteDraftFormDefinition', () => {
    it('should throw if no draft', async () => {
      jest.mocked(formMetadata.get).mockResolvedValue({
        ...formMetadataDocument,
        draft: undefined
      })
      await expect(deleteDraftFormDefinition(id, author)).rejects.toThrow(
        "Form with ID '661e4ca5039739ef2902b214' has no draft state"
      )
    })

    it('should throw if no live', async () => {
      jest.mocked(formMetadata.get).mockResolvedValue({
        ...formMetadataDocument,
        live: undefined
      })
      await expect(deleteDraftFormDefinition(id, author)).rejects.toThrow(
        "Form with ID '661e4ca5039739ef2902b214' has no live state"
      )
    })

    it('should throw if update error', async () => {
      jest.mocked(formMetadata.get).mockResolvedValue({
        ...formMetadataDocument,
        live: { ...formMetadataDocument.draft }
      })
      jest.mocked(formMetadata.update).mockImplementationOnce(() => {
        throw new Error('DB error')
      })
      await expect(deleteDraftFormDefinition(id, author)).rejects.toThrow(
        'DB error'
      )
    })

    it('should delete draft', async () => {
      jest.mocked(formMetadata.get).mockResolvedValue({
        ...formMetadataDocument,
        live: { ...formMetadataDocument.draft }
      })
      await deleteDraftFormDefinition(id, author)
      expect(true).toBe(true)
    })
  })
})

/**
 * @import { FormDefinition, FormMetadataDocument, QueryOptions } from '@defra/forms-model'
 * @import { WithId } from 'mongodb'
 */
