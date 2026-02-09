import { FormDefinitionError, FormDefinitionErrorType } from '@defra/forms-model'

import { buildList } from '~/src/api/forms/__stubs__/definition.js'
import {
  addListToDraftFormDefinition,
  removeListOnDraftFormDefinition,
  updateListOnDraftFormDefinition
} from '~/src/api/forms/service/lists.js'
import { createServer } from '~/src/api/server.js'
import { auth } from '~/test/fixtures/auth.js'

jest.mock('~/src/mongo.js')
jest.mock('~/src/api/forms/service/lists.js')

describe('Lists route', () => {
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

  describe('Success responses', () => {
    test('Testing POST /forms/{id}/definition/draft/lists', async () => {
      const payload = buildList({
        id: undefined
      })

      const expectedList = {
        ...buildList({
          ...payload
        }),
        id: '9719c91f-4341-4dc8-91a5-cab7bbdddb83'
      }

      const createComponentOnDraftDefinitionMock = jest
        .mocked(addListToDraftFormDefinition)
        .mockResolvedValue(expectedList)

      const response = await server.inject({
        method: 'POST',
        url: `/forms/${id}/definition/draft/lists`,
        payload,
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({
        id: '9719c91f-4341-4dc8-91a5-cab7bbdddb83',
        list: expectedList,
        status: 'created'
      })
      const [, list] = createComponentOnDraftDefinitionMock.mock.calls[0]
      expect(list).toEqual({
        ...expectedList,
        id: expect.any(String)
      })
    })

    test('Testing PUT /forms/{id}/definition/draft/lists/{listId}', async () => {
      const listId = '9719c91f-4341-4dc8-91a5-cab7bbdddb83'
      const list = buildList({
        id: '9719c91f-4341-4dc8-91a5-cab7bbdddb83'
      })

      const updateList = jest.mocked(updateListOnDraftFormDefinition).mockResolvedValue(list)

      const response = await server.inject({
        method: 'PUT',
        url: `/forms/${id}/definition/draft/lists/${listId}`,
        payload: list,
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({
        id: '9719c91f-4341-4dc8-91a5-cab7bbdddb83',
        list,
        status: 'updated'
      })
      const [, calledId, calledList] = updateList.mock.calls[0]
      expect(calledId).toEqual(listId)
      expect(calledList).toEqual(list)
    })

    test('Testing DELETE /forms/{id}/definition/draft/lists/{listId}', async () => {
      const listId = '9719c91f-4341-4dc8-91a5-cab7bbdddb83'

      const response = await server.inject({
        method: 'DELETE',
        url: `/forms/${id}/definition/draft/lists/${listId}`,
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({
        id: listId,
        status: 'deleted'
      })
      const [calledFormId, calledId] = jest.mocked(removeListOnDraftFormDefinition).mock.calls[0]
      expect(calledFormId).toEqual(id)
      expect(calledId).toEqual(listId)
    })
  })

  describe('Error responses', () => {
    test('Testing POST /forms/{id}/definition/draft/lists with invalid payload returns validation errors', async () => {
      const invalidListPayload = buildList({
        // @ts-expect-error invalid parameter
        unknown: 1
      })
      const response = await server.inject({
        method: 'POST',
        url: `/forms/${id}/definition/draft/lists`,
        payload: invalidListPayload,
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'InvalidFormDefinitionError',
        message: '"unknown" is not allowed',
        statusCode: 400,
        cause: [
          {
            id: FormDefinitionError.Other,
            type: FormDefinitionErrorType.Type,
            message: '"unknown" is not allowed',
            detail: {
              child: 'unknown',
              label: 'unknown',
              value: 1,
              key: 'unknown'
            }
          }
        ]
      })
    })

    test('Testing POST /forms/{id}/definition/draft/lists with invalid payload returns mapped validation errors', async () => {
      const invalidListPayload = buildList({
        items: [
          { text: 'A', value: 'dupe-value' },
          { text: 'B', value: 'dupe-value' }
        ]
      })

      const response = await server.inject({
        method: 'POST',
        url: `/forms/${id}/definition/draft/lists`,
        payload: invalidListPayload,
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'InvalidFormDefinitionError',
        message: '"items[1]" contains a duplicate value',
        statusCode: 400,
        cause: [
          {
            id: FormDefinitionError.UniqueListItemValue,
            type: FormDefinitionErrorType.Unique,
            message: '"items[1]" contains a duplicate value',
            detail: { path: ['items', 1], pos: 1, dupePos: 0 }
          }
        ]
      })
    })

    test('Testing PUT /forms/{id}/definition/draft/lists/{listId} with invalid payload returns validation errors', async () => {
      const invalidListPayload = buildList({
        id: undefined
      })
      const response = await server.inject({
        method: 'PUT',
        url: `/forms/${id}/definition/draft/lists/8d05e220-2145-40f4-9508-fe946dec6fd9`,
        payload: invalidListPayload,
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'InvalidFormDefinitionError',
        message: '"id" is required',
        statusCode: 400,
        cause: [
          {
            id: FormDefinitionError.Other,
            type: FormDefinitionErrorType.Type,
            message: '"id" is required',
            detail: { label: 'id', key: 'id' }
          }
        ]
      })
    })

    test('Testing PUT /forms/{id}/definition/draft/lists with invalid payload returns mapped validation errors', async () => {
      const invalidListPayload = buildList({
        id: '8d05e220-2145-40f4-9508-fe946dec6fd9',
        items: [
          { text: 'Dupe text', value: 'A' },
          { text: 'Dupe text', value: 'B' }
        ]
      })

      const response = await server.inject({
        method: 'PUT',
        url: `/forms/${id}/definition/draft/lists/8d05e220-2145-40f4-9508-fe946dec6fd9`,
        payload: invalidListPayload,
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'InvalidFormDefinitionError',
        message: '"items[1]" contains a duplicate value',
        statusCode: 400,
        cause: [
          {
            id: FormDefinitionError.UniqueListItemText,
            type: FormDefinitionErrorType.Unique,
            message: '"items[1]" contains a duplicate value',
            detail: { path: ['items', 1], pos: 1, dupePos: 0 }
          }
        ]
      })
    })

    test('Testing PUT /forms/{id}/definition/draft/lists/{listId} with invalid params returns validation errors', async () => {
      const invalidId = 'invalid-uuid'
      const list = buildList({
        id: '9719c91f-4341-4dc8-91a5-cab7bbdddb83'
      })

      const response = await server.inject({
        method: 'PUT',
        url: `/forms/${id}/definition/draft/lists/${invalidId}`,
        payload: list,
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)

      // Params errors should still return Bad Request with a joi error (not an InvalidFormDefinitionError)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        message: '"listId" must be a valid GUID',
        statusCode: 400,
        validation: { source: 'params', keys: ['listId'] },
        custom: { defaultError: expect.any(Error) }
      })
    })
  })
})

/**
 * @import { Server } from '@hapi/hapi'
 */
