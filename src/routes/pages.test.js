import { buildDefinition, buildQuestionPage, buildSummaryPage } from '~/src/api/forms/__stubs__/definition.js'
import { reorderDraftFormDefinitionPages } from '~/src/api/forms/service/definition.js'
import {
  createPageOnDraftDefinition,
  deletePageOnDraftDefinition,
  patchFieldsOnDraftDefinitionPage
} from '~/src/api/forms/service/page.js'
import { createServer } from '~/src/api/server.js'
import { auth } from '~/test/fixtures/auth.js'

jest.mock('~/src/mongo.js')
jest.mock('~/src/api/forms/service/definition.js')
jest.mock('~/src/api/forms/service/page.js')

describe('Pages route', () => {
  /** @type {Server} */
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(() => {
    return server.stop()
  })

  const okStatusCode = 200
  const badRequestStatusCode = 400
  const jsonContentType = 'application/json'
  const id = '661e4ca5039739ef2902b214'
  const pageId = 'c7b9f0fa-3223-46b8-b7d3-b2bf00f37155'
  const authorId = 'test-service-001'
  const authorDisplayName = 'Test Service'

  /**
   * @satisfies {FormMetadataAuthor}
   */
  const author = { id: authorId, displayName: authorDisplayName }

  /** @satisfies {PatchPageFields} */
  const stubPatchPageFields = {
    title: 'Updated title for page'
  }

  describe('Success responses', () => {
    test('Testing POST /forms/{id}/definition/draft/pages adds a new page to the db and populates id', async () => {
      const pagePayload = buildQuestionPage({
        id: undefined
      })
      const createPageMock = jest.mocked(createPageOnDraftDefinition)
      createPageMock.mockResolvedValue(pagePayload)

      const response = await server.inject({
        method: 'POST',
        url: `/forms/${id}/definition/draft/pages`,
        payload: pagePayload,
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual(pagePayload)
      expect(createPageMock).toHaveBeenCalledWith(
        id,
        { ...pagePayload, id: expect.any(String) },
        { ...author, id: expect.any(String) }
      )
    })

    test('Testing PATCH /forms/{id}/definition/draft/pages/{pageId} updates fields on a page', async () => {
      const questionPage = buildQuestionPage({
        title: 'Updated title for page'
      })
      const patchFieldsOnDraftPageMock = jest.mocked(patchFieldsOnDraftDefinitionPage).mockResolvedValue(questionPage)

      const response = await server.inject({
        method: 'PATCH',
        url: `/forms/${id}/definition/draft/pages/${pageId}`,
        payload: stubPatchPageFields,
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual(questionPage)
      const [calledFormId, calledPageId, patchedFields] = patchFieldsOnDraftPageMock.mock.calls[0]
      expect([calledFormId, calledPageId, patchedFields]).toEqual([id, pageId, stubPatchPageFields])
    })

    test('Testing POST /forms/{id}/definition/draft/pages/order reorders the pages in the db', async () => {
      const pageOneId = '5113a8ab-b297-46b5-b732-7fe42660c4db'
      const pageTwoId = 'd3dc6af2-3235-4455-80f7-941f0bf69c4f'

      const expectedDefinition = buildDefinition({
        pages: [
          buildQuestionPage({
            id: pageOneId,
            title: 'Page one'
          }),
          buildQuestionPage({
            id: pageOneId,
            title: 'Page two'
          }),
          buildSummaryPage()
        ]
      })
      jest.mocked(reorderDraftFormDefinitionPages).mockResolvedValue(expectedDefinition)

      const response = await server.inject({
        method: 'POST',
        url: `/forms/${id}/definition/draft/pages/order`,
        payload: [pageOneId, pageTwoId],
        auth
      })

      expect(response.result).toEqual(expectedDefinition)
      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
    })

    test('Testing DELETE /forms/{id}/definition/draft/pages/{pageId}', async () => {
      const pageId = '9719c91f-4341-4dc8-91a5-cab7bbdddb83'

      const response = await server.inject({
        method: 'DELETE',
        url: `/forms/${id}/definition/draft/pages/${pageId}`,
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({
        id: pageId,
        status: 'deleted'
      })
      const [calledFormId, calledId] = jest.mocked(deletePageOnDraftDefinition).mock.calls[0]
      expect(calledFormId).toEqual(id)
      expect(calledId).toEqual(pageId)
    })
  })

  describe('Error responses', () => {
    test('Testing POST /forms/{id}/definition/draft/pages with invalid payload returns validation errors', async () => {
      const invalidPageObject /** @type {Page} */ = buildQuestionPage({
        id: 'not-a-valid-id',
        path: '/status'
      })

      const response = await server.inject({
        method: 'POST',
        url: `/forms/${id}/definition/draft/pages`,
        payload: invalidPageObject,
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        message: '"path" contains an invalid value. "id" must be a valid GUID',
        statusCode: 400,
        validation: {
          keys: ['path', 'id'],
          source: 'payload'
        }
      })
    })

    test('Testing POST /forms/{id}/definition/draft/pages/order with invalid payload returns validation errors', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/forms/${id}/definition/draft/pages/order/`,
        payload: ['not-a-valid-uuid'],
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({
        error: 'Bad Request',
        message: '"[0]" must be a valid GUID. "value" does not contain 1 required value(s)',
        statusCode: 400,
        validation: {
          keys: ['0', ''],
          source: 'payload'
        },
        custom: {
          defaultError: expect.anything()
        }
      })
    })

    test('Testing POST /forms/{id}/definition/draft/pages/{pageId} with invalid payload returns validation errors', async () => {
      const invalidPatchPayload = {
        id: 1234
      }
      const response = await server.inject({
        method: 'PATCH',
        url: `/forms/${id}/definition/draft/pages/${pageId}`,
        payload: invalidPatchPayload,
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        message: '"id" is not allowed',
        statusCode: 400,
        validation: {
          keys: ['id']
        }
      })
    })
  })
})

/**
 * @import { FormMetadataAuthor, PatchPageFields } from '@defra/forms-model'
 * @import { Server } from '@hapi/hapi'
 */
