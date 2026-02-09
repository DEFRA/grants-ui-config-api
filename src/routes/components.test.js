import {
  buildDefinition,
  buildQuestionPage,
  buildSummaryPage,
  buildTextFieldComponent
} from '~/src/api/forms/__stubs__/definition.js'
import {
  createComponentOnDraftDefinition,
  deleteComponentOnDraftDefinition,
  updateComponentOnDraftDefinition
} from '~/src/api/forms/service/component.js'
import { reorderDraftFormDefinitionComponents } from '~/src/api/forms/service/definition.js'
import { createServer } from '~/src/api/server.js'
import { auth } from '~/test/fixtures/auth.js'

jest.mock('~/src/mongo.js')
jest.mock('~/src/api/forms/service/component.js')
jest.mock('~/src/api/forms/service/definition.js')

describe('Components route', () => {
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
  const componentId = '64d9c012-2238-4ab2-ab11-6290d3c0cf15'

  const stubTextFieldComponent = buildTextFieldComponent({
    id: undefined,
    title: 'What is your name?',
    name: 'Ghcbmw'
  })

  describe('Success responses', () => {
    test('Testing POST /forms/{id}/definition/draft/pages/{pageId}/components adds a new component to a page', async () => {
      const expectedComponent = buildTextFieldComponent({
        ...stubTextFieldComponent,
        id: '3813a55d-0958-47f9-8522-94b3fc3818d7'
      })
      const createComponentOnDraftDefinitionMock = jest
        .mocked(createComponentOnDraftDefinition)
        .mockResolvedValue(expectedComponent)

      const response = await server.inject({
        method: 'POST',
        url: `/forms/${id}/definition/draft/pages/${pageId}/components`,
        payload: stubTextFieldComponent,
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual(expectedComponent)
      const [calledFormId, calledPageId, component, , prepend] = createComponentOnDraftDefinitionMock.mock.calls[0]
      expect([calledFormId, calledPageId, component, prepend]).toEqual([
        id,
        pageId,
        {
          ...stubTextFieldComponent,
          id: expect.any(String)
        },
        false
      ])
    })

    test('Testing POST /forms/{id}/definition/draft/page/{pageId}/components/order reorders the components in the db', async () => {
      const componentOneId = 'e6511b1c-c813-43d7-92c4-d84ba35d5f62'
      const componentTwoId = 'e3a1cb1e-8c9e-41d7-8ba7-719829bce84a'
      const componentThreeId = 'b90e6453-d4c1-46a4-a233-3dbee566c79e'
      const pageOneId = '0ac3b3e8-422e-4253-a7a9-506d3234e12f'
      const summaryPageId = 'b90e6453-d4c1-46a4-a233-3dbee566c79e'

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
        pages: [
          expectedPageOne,
          buildSummaryPage({
            id: summaryPageId
          })
        ]
      })
      jest.mocked(reorderDraftFormDefinitionComponents).mockResolvedValue(expectedDefinition)

      const response = await server.inject({
        method: 'POST',
        url: `/forms/${id}/definition/draft/page/${pageOneId}/components/order`,
        payload: [componentTwoId, componentThreeId, componentOneId],
        auth
      })

      expect(response.result).toEqual(expectedDefinition)
      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
    })

    test('Testing PUT /forms/{id}/definition/draft/pages/{pageId}/components/{componentId} updates a component on a page', async () => {
      const updatedComponent = buildTextFieldComponent({
        id: componentId,
        title: 'New component title'
      })
      const updateComponentOnDraftPageMock = jest
        .mocked(updateComponentOnDraftDefinition)
        .mockResolvedValue(updatedComponent)

      const response = await server.inject({
        method: 'PUT',
        url: `/forms/${id}/definition/draft/pages/${pageId}/components/${componentId}`,
        payload: updatedComponent,
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual(updatedComponent)
      expect(updateComponentOnDraftPageMock).toHaveBeenCalled()
      const [calledFormId, calledPageId, calledComponentId, component] = updateComponentOnDraftPageMock.mock.calls[0]
      expect([calledFormId, calledPageId, calledComponentId, component]).toEqual([
        id,
        pageId,
        componentId,
        updatedComponent
      ])
    })

    test('Testing POST /forms/{id}/definition/draft/pages/{pageId}/components?prepend=true adds a new component to the start of a page', async () => {
      const expectedComponent = buildTextFieldComponent({
        ...stubTextFieldComponent,
        id: '3813a55d-0958-47f9-8522-94b3fc3818d7'
      })
      const createComponentOnDraftDefinitionMock = jest
        .mocked(createComponentOnDraftDefinition)
        .mockResolvedValue(expectedComponent)

      const response = await server.inject({
        method: 'POST',
        url: `/forms/${id}/definition/draft/pages/${pageId}/components?prepend=true`,
        payload: stubTextFieldComponent,
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      const [, , , , prepend] = createComponentOnDraftDefinitionMock.mock.calls[0]
      expect(prepend).toBe(true)
    })
  })

  describe('Error responses', () => {
    const invalidComponent = buildTextFieldComponent({
      id: 'not-a-valid-id'
    })

    test.each([
      {
        url: `/forms/${id}/definition/draft/pages/not-a-valid-guid/components`,
        errors: {
          message: '"pageId" must be a valid GUID',
          validation: {
            keys: ['pageId'],
            source: 'params'
          }
        }
      },
      {
        url: `/forms/${id}/definition/draft/pages/${pageId}/components`,
        errors: {
          message: '"id" must be a valid GUID',
          error: 'InvalidFormDefinitionError'
        }
      }
    ])(
      'Testing POST /forms/{id}/definition/draft/pages/{pageId}/components with invalid payload returns validation errors',
      async ({ url, errors }) => {
        const response = await server.inject({
          method: 'POST',
          url,
          payload: invalidComponent,
          auth
        })

        expect(response.statusCode).toEqual(badRequestStatusCode)
        expect(response.headers['content-type']).toContain(jsonContentType)
        const validation = errors.validation ? { validation: errors.validation } : {}
        expect(response.result).toMatchObject({
          error: errors.error ?? 'Bad Request',
          message: errors.message,
          statusCode: 400,
          ...validation
        })
      }
    )

    test('Testing PUT /forms/{id}/definition/draft/pages/{pageId}/components/{componentId} with invalid payload returns validation errors', async () => {
      const invalidPatchPayload = {
        id: 1234
      }
      const response = await server.inject({
        method: 'PUT',
        url: `/forms/${id}/definition/draft/pages/${pageId}/components/${componentId}`,
        payload: invalidPatchPayload,
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'InvalidFormDefinitionError',
        message: '"type" is required. "id" must be a string',
        statusCode: 400
      })
    })

    test('Testing PUT /forms/{id}/definition/draft/pages/{pageId}/components/{componentId} without an id returns validation errors', async () => {
      const componentWithoutAnId = buildTextFieldComponent({
        title: 'New component title'
      })
      delete componentWithoutAnId.id

      const response = await server.inject({
        method: 'PUT',
        url: `/forms/${id}/definition/draft/pages/${pageId}/components/${componentId}`,
        payload: componentWithoutAnId,
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'InvalidFormDefinitionError',
        message: '"id" is required',
        statusCode: 400
      })
    })

    test('Testing DELETE /forms/{id}/pages/{pageId}/components/{componentId} route returns a "deleted" status', async () => {
      const deleteComponentOnDraftDefinitionMock = jest.mocked(deleteComponentOnDraftDefinition).mockResolvedValue()

      const response = await server.inject({
        method: 'DELETE',
        url: `/forms/${id}/definition/draft/pages/${pageId}/components/${componentId}`,
        auth,
        payload: {}
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        componentId,
        status: 'deleted'
      })
      expect(deleteComponentOnDraftDefinitionMock).toHaveBeenCalledWith(id, pageId, componentId, expect.anything())
    })
  })
})

/**
 * @import { Server } from '@hapi/hapi'
 */
