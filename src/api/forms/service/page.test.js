import {
  buildDefinition,
  buildQuestionPage,
  buildSummaryPage
} from '@defra/forms-model/stubs'
import Boom from '@hapi/boom'
import { pino } from 'pino'

import * as formDefinition from '~/src/api/forms/repositories/form-definition-repository.js'
import * as formMetadata from '~/src/api/forms/repositories/form-metadata-repository.js'
import { formMetadataDocument } from '~/src/api/forms/service/__stubs__/service.js'
import { mockFormVersionDocument } from '~/src/api/forms/service/__stubs__/versioning.js'
import * as definitionService from '~/src/api/forms/service/definition.js'
import {
  createPageOnDraftDefinition,
  deletePageOnDraftDefinition,
  getFormDefinitionPage,
  patchFieldsOnDraftDefinitionPage
} from '~/src/api/forms/service/page.js'
import * as versioningService from '~/src/api/forms/service/versioning.js'
import { empty as emptyFormWithSummary } from '~/src/api/forms/templates.js'
import { getAuthor } from '~/src/helpers/get-author.js'
import { prepareDb } from '~/src/mongo.js'

jest.mock('~/src/helpers/get-author.js')
jest.mock('~/src/api/forms/repositories/form-definition-repository.js')
jest.mock('~/src/api/forms/repositories/form-metadata-repository.js')
jest.mock('~/src/mongo.js')
jest.mock('~/src/api/forms/service/versioning.js')

jest.useFakeTimers().setSystemTime(new Date('2020-01-01'))

const author = getAuthor()
const summaryPage = buildSummaryPage()

describe('Page service', () => {
  const id = '661e4ca5039739ef2902b214'
  const pageId = 'ffefd409-f3f4-49fe-882e-6e89f44631b1'

  let definition = emptyFormWithSummary()

  beforeAll(async () => {
    await prepareDb(pino())
  })

  beforeEach(() => {
    definition = emptyFormWithSummary()
    jest.mocked(formMetadata.get).mockResolvedValue(formMetadataDocument)
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

  describe('getFormDefinitionPage', () => {
    it('should get a page if it exists', async () => {
      const questionPageId = 'd9c99072-d25d-4688-ab7d-3822cffe802b'
      const questionPage = buildQuestionPage({
        id: questionPageId
      })

      const definition2 = buildDefinition({
        pages: [questionPage, summaryPage]
      })

      const spy = jest
        .spyOn(definitionService, 'getFormDefinition')
        .mockResolvedValueOnce(definition2)

      const foundPage = await getFormDefinitionPage('123', questionPageId)

      expect(foundPage).toEqual(questionPage)

      spy.mockRestore()
    })

    it('should fail is page does not exist', async () => {
      const definition2 = buildDefinition(definition)

      jest.mocked(formDefinition.get).mockResolvedValueOnce(definition2)

      await expect(
        getFormDefinitionPage('123', 'bdadbe9d-3c4d-4ec1-884d-e3576d60fe9d')
      ).rejects.toThrow(
        Boom.notFound(
          "Page not found with id 'bdadbe9d-3c4d-4ec1-884d-e3576d60fe9d'"
        )
      )
    })
  })

  describe('createPageOnDraftDefinition', () => {
    it('should create a new page when a summary page exists', async () => {
      const formDefinitionPageCustomisedTitle = buildQuestionPage({
        title: 'A new form page',
        path: '/a-new-form-page'
      })

      jest.mocked(formDefinition.get).mockResolvedValueOnce(definition)

      const dbMetadataSpy = jest.spyOn(formMetadata, 'updateAudit')
      const dbDefinitionSpy = jest
        .spyOn(formDefinition, 'addPage')
        .mockResolvedValue(
          buildDefinition({
            ...definition,
            pages: [...definition.pages, formDefinitionPageCustomisedTitle]
          })
        )
      const page = await createPageOnDraftDefinition(
        id,
        formDefinitionPageCustomisedTitle,
        author
      )
      const dbOperationArgs = dbMetadataSpy.mock.calls[0]
      const [formId1, page1] = dbDefinitionSpy.mock.calls[0]

      expect(formId1).toBe(id)
      expect(page1).toMatchObject({
        ...formDefinitionPageCustomisedTitle,
        id: expect.any(String)
      })
      expect(dbOperationArgs[0]).toBe(id)
      expect(dbOperationArgs[1]).toEqual(author)
      expect(page).toMatchObject({
        ...formDefinitionPageCustomisedTitle,
        id: expect.any(String)
      })
    })

    it('should create a new page when a summary page does not exist', async () => {
      const formDefinitionPageCustomisedTitle = buildQuestionPage({
        title: 'A new form page',
        path: '/a-new-form-page'
      })
      const definitionWithoutSummary = buildDefinition({
        pages: []
      })

      jest
        .mocked(formDefinition.get)
        .mockResolvedValueOnce(definitionWithoutSummary)

      const dbMetadataSpy = jest.spyOn(formMetadata, 'updateAudit')
      const dbDefinitionSpy = jest.spyOn(formDefinition, 'addPage')

      await createPageOnDraftDefinition(
        id,
        formDefinitionPageCustomisedTitle,
        author
      )
      const dbOperationArgs = dbMetadataSpy.mock.calls[0]

      expect(dbDefinitionSpy).toHaveBeenCalledWith(
        id,
        {
          ...formDefinitionPageCustomisedTitle,
          id: expect.any(String)
        },
        expect.anything()
      )
      expect(dbOperationArgs[0]).toBe(id)
      expect(dbOperationArgs[1]).toEqual(author)
    })

    it('should fail if path is duplicate', async () => {
      const pageOne = buildQuestionPage({
        path: '/page-one'
      })
      const pageOneDuplicate = buildQuestionPage({
        title: 'Page One Duplicate',
        path: '/page-one'
      })
      const definition1 = buildDefinition({
        ...definition,
        pages: [pageOne]
      })

      jest.mocked(formDefinition.get).mockResolvedValueOnce(definition1)

      await expect(
        createPageOnDraftDefinition('123', pageOneDuplicate, author)
      ).rejects.toThrow(Boom.conflict('Duplicate page path on Form ID 123'))
    })

    it('should fail if no draft definition exists', async () => {
      jest
        .mocked(formDefinition.get)
        .mockRejectedValueOnce(Boom.notFound('Error'))

      const dbMetadataSpy = jest.spyOn(formMetadata, 'update')

      await expect(
        createPageOnDraftDefinition('123', buildQuestionPage({}), author)
      ).rejects.toThrow(Boom.notFound('Error'))
      expect(dbMetadataSpy).not.toHaveBeenCalled()
    })

    it('should surface errors correctly', async () => {
      jest
        .mocked(formDefinition.addPage)
        .mockRejectedValueOnce(Boom.badRequest('Error'))
      jest.mocked(formDefinition.get).mockResolvedValueOnce(definition)
      await expect(
        createPageOnDraftDefinition('123', buildQuestionPage({}), author)
      ).rejects.toThrow(Boom.badRequest('Error'))
    })
  })

  describe('patchFieldsOnDraftDefinitionPage', () => {
    const initialPage = buildQuestionPage({})
    const pageFields = /** @satisfies {PatchPageFields} */ {
      title: 'Updated Title',
      path: '/updated-title'
    }
    const initialDefinition = buildDefinition({
      pages: [initialPage, summaryPage]
    })

    it('should update page fields', async () => {
      const pageFields = {
        title: 'Updated Title',
        path: '/updated-title'
      }

      const expectedPage = buildQuestionPage({
        ...pageFields
      })

      jest
        .mocked(formDefinition.updatePageFields)
        .mockResolvedValueOnce(buildDefinition())

      const spy = jest
        .spyOn(definitionService, 'getFormDefinition')
        .mockResolvedValue(
          buildDefinition({
            pages: [expectedPage, summaryPage]
          })
        )
      const page = await patchFieldsOnDraftDefinitionPage(
        '123',
        pageId,
        pageFields,
        author
      )

      expect(page).toEqual(expectedPage)
      spy.mockRestore()
    })

    it('should fail if the page does not exist', async () => {
      jest.mocked(formDefinition.get).mockResolvedValueOnce(initialDefinition)
      jest.mocked(formDefinition.get).mockResolvedValueOnce(
        buildDefinition({
          pages: []
        })
      )
      jest.mocked(formDefinition.get).mockResolvedValueOnce(
        buildDefinition({
          pages: []
        })
      )

      await expect(
        patchFieldsOnDraftDefinitionPage('123', pageId, pageFields, author)
      ).rejects.toThrow(
        Boom.notFound(
          "Page not found with id 'ffefd409-f3f4-49fe-882e-6e89f44631b1'"
        )
      )
    })

    it('should fail if updating to duplicate path', async () => {
      const pageOne = buildQuestionPage({
        id: 'p1',
        path: '/page-one'
      })
      const pageTwo = buildQuestionPage({
        id: 'p2',
        path: '/page-two'
      })
      const definition1 = buildDefinition({
        ...definition,
        pages: [pageOne, pageTwo]
      })

      jest.mocked(formDefinition.get).mockResolvedValueOnce(definition1)
      jest.mocked(formDefinition.get).mockResolvedValueOnce(definition1)

      const pageFieldsForConflict = /** @satisfies {PatchPageFields} */ {
        title: 'Updated Title',
        path: '/page-one'
      }

      await expect(
        patchFieldsOnDraftDefinitionPage(
          '123',
          'p2',
          pageFieldsForConflict,
          author
        )
      ).rejects.toThrow(Boom.notFound('Duplicate page path on Form ID 123'))
    })

    it('should not fail if not updating path', async () => {
      const pageOne = buildQuestionPage({
        id: 'p1',
        path: '/page-one'
      })
      const pageTwo = buildQuestionPage({
        id: 'p2',
        path: '/page-two'
      })
      const definition1 = buildDefinition({
        ...definition,
        pages: [pageOne, pageTwo]
      })

      jest.mocked(formDefinition.get).mockResolvedValueOnce(definition1)
      jest.mocked(formDefinition.get).mockResolvedValueOnce(definition1)

      const pageFieldsForConflict = /** @satisfies {PatchPageFields} */ {
        title: 'Updated Title'
      }

      const res = await patchFieldsOnDraftDefinitionPage(
        '123',
        'p2',
        pageFieldsForConflict,
        author
      )
      expect(res).toBeDefined()
    })

    it('should succeed when condition exists in form definition', async () => {
      const definitionWithCondition = {
        ...initialDefinition,
        items: [
          {
            id: 'valid-condition-id',
            name: 'valid-condition',
            displayName: 'Valid',
            conditions: []
          }
        ]
      }

      const pageFieldsWithValidCondition = {
        condition: 'valid-condition-id'
      }

      const spy = jest
        .spyOn(definitionService, 'getFormDefinition')
        .mockResolvedValueOnce(definitionWithCondition)
        .mockResolvedValueOnce(definitionWithCondition)
        .mockResolvedValueOnce(definitionWithCondition)

      jest
        .mocked(formDefinition.updatePageFields)
        .mockResolvedValueOnce(buildDefinition())

      const result = await patchFieldsOnDraftDefinitionPage(
        '123',
        pageId,
        pageFieldsWithValidCondition,
        author
      )

      expect(result).toBeDefined()
      expect(formDefinition.updatePageFields).toHaveBeenCalledWith(
        '123',
        pageId,
        pageFieldsWithValidCondition,
        expect.anything()
      )

      spy.mockRestore()
    })
  })

  describe('deletePageOnDraftDefinition', () => {
    it('should delete the page', async () => {
      const dbDefinitionSpy = jest.spyOn(formDefinition, 'deletePage')
      const dbMetadataSpy = jest.spyOn(formMetadata, 'updateAudit')

      await deletePageOnDraftDefinition(id, pageId, author)

      expect(dbDefinitionSpy).toHaveBeenCalled()
      const [calledFormId, calledPageId] = dbDefinitionSpy.mock.calls[0]

      expect([calledFormId, calledPageId]).toEqual([id, pageId])
      const [metaFormId, metaUpdateOperations] = dbMetadataSpy.mock.calls[0]
      expect(metaFormId).toBe(id)
      expect(metaUpdateOperations).toEqual(author)
    })

    it('should surface any errors', async () => {
      jest
        .mocked(formDefinition.deletePage)
        .mockRejectedValueOnce(Boom.notFound('Form ID 123 not found'))

      await expect(
        deletePageOnDraftDefinition('123', pageId, author)
      ).rejects.toThrow(Boom.notFound('Form ID 123 not found'))
    })
  })
})
