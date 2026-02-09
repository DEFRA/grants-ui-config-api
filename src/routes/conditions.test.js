import { ConditionType, Coordinator, OperatorName, formDefinitionV2Schema } from '@defra/forms-model'
import { buildDefinition, buildQuestionPage } from '@defra/forms-model/stubs'

import { buildCondition } from '~/src/api/forms/__stubs__/definition.js'
import { InvalidFormDefinitionError } from '~/src/api/forms/errors.js'
import {
  addConditionToDraftFormDefinition,
  removeConditionOnDraftFormDefinition,
  updateConditionOnDraftFormDefinition
} from '~/src/api/forms/service/conditions.js'
import { createServer } from '~/src/api/server.js'
import { auth } from '~/test/fixtures/auth.js'

jest.mock('~/src/mongo.js')
jest.mock('~/src/api/forms/service/conditions.js')

describe('Conditions route', () => {
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
  const jsonContentType = 'application/json'
  const id = '661e4ca5039739ef2902b214'

  describe('Success responses', () => {
    test('Testing POST /forms/{id}/definition/draft/conditions', async () => {
      const payload = buildCondition({
        id: undefined,
        coordinator: Coordinator.AND,
        items: [
          {
            id: '6746b15f-69f9-454c-a324-c62420069618',
            componentId: '99cfccef-6292-4e7f-895f-4404751beb3c',
            operator: OperatorName.Is,
            type: ConditionType.StringValue,
            value: 'Enrique Chase'
          },
          {
            id: '018a7d26-d1f1-4bc6-bf48-b882b69bfbaa',
            conditionId: '70de3a17-d29c-45e4-a00b-3ce0d05a8ed2'
          }
        ]
      })

      const expectedCondition = {
        ...buildCondition({
          ...payload
        }),
        id: '295e6e7a-5388-4f3f-9d99-1a1e749b6b0c'
      }

      const addConditionToDraftFormDefinitionMock = jest
        .mocked(addConditionToDraftFormDefinition)
        .mockResolvedValue(expectedCondition)

      const response = await server.inject({
        method: 'POST',
        url: `/forms/${id}/definition/draft/conditions`,
        payload,
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({
        id: '295e6e7a-5388-4f3f-9d99-1a1e749b6b0c',
        condition: expectedCondition,
        status: 'created'
      })
      const [, condition] = addConditionToDraftFormDefinitionMock.mock.calls[0]
      expect(condition).toEqual({
        ...expectedCondition,
        id: expect.any(String)
      })
    })

    test('Testing PUT /forms/{id}/definition/draft/conditions/{conditionId}', async () => {
      const conditionId = '6e4c2f74-5bd9-48b4-b991-f2a021dcde59'
      const condition = buildCondition({
        id: conditionId,
        coordinator: Coordinator.AND,
        items: [
          {
            id: '6746b15f-69f9-454c-a324-c62420069618',
            componentId: '99cfccef-6292-4e7f-895f-4404751beb3c',
            operator: OperatorName.Is,
            type: ConditionType.StringValue,
            value: 'Enrique Chase'
          },
          {
            id: '018a7d26-d1f1-4bc6-bf48-b882b69bfbaa',
            conditionId: '70de3a17-d29c-45e4-a00b-3ce0d05a8ed2'
          }
        ]
      })

      const updateCondition = jest.mocked(updateConditionOnDraftFormDefinition).mockResolvedValue(condition)

      const response = await server.inject({
        method: 'PUT',
        url: `/forms/${id}/definition/draft/conditions/${conditionId}`,
        payload: condition,
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({
        id: '6e4c2f74-5bd9-48b4-b991-f2a021dcde59',
        condition,
        status: 'updated'
      })
      const [, calledId, calledCondition] = updateCondition.mock.calls[0]
      expect(calledId).toEqual(conditionId)
      expect(calledCondition).toEqual(condition)
    })

    test('Testing DELETE /forms/{id}/definition/draft/conditions/{conditionId}', async () => {
      const conditionId = '9719c91f-4341-4dc8-91a5-cab7bbdddb83'

      const response = await server.inject({
        method: 'DELETE',
        url: `/forms/${id}/definition/draft/conditions/${conditionId}`,
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({
        id: conditionId,
        status: 'deleted'
      })
      const [calledFormId, calledId] = jest.mocked(removeConditionOnDraftFormDefinition).mock.calls[0]
      expect(calledFormId).toEqual(id)
      expect(calledId).toEqual(conditionId)
    })
  })

  describe('Error responses', () => {
    test('Testing POST /forms/{id}/definition/draft/conditions fails and returns causes in the response', async () => {
      const componentId = '99cfccef-6292-4e7f-895f-4404751beb3c'

      const payload = buildCondition({
        id: '8dc5d731-1094-4ca6-b8a2-28db45f7b34b',
        coordinator: Coordinator.AND,
        items: [
          {
            id: '6746b15f-69f9-454c-a324-c62420069618',
            componentId,
            operator: OperatorName.Is,
            type: ConditionType.StringValue,
            value: 'Enrique Chase'
          }
        ]
      })

      /** @type {ConditionDataV2} */
      const stringValueData = {
        id: '923086db-02d1-4e80-9d7c-ca1b20101de9',
        componentId,
        operator: OperatorName.Is,
        type: ConditionType.StringValue,
        value: 'Enrique Chase'
      }

      /** @type {ConditionWrapperV2} */
      const stringValueCondition = {
        id: 'c622f390-8334-4828-a8cb-132494017d7a',
        displayName: 'isFullNameEnriqueChase',
        items: [stringValueData]
      }

      // Condition references a component that doesn't exist
      const refConditionComponentIdDefinition = buildDefinition({
        name: 'Test form',
        pages: [buildQuestionPage({ id: 'cf49d84a-096a-461a-ae8c-a4c38ec1837d' })],
        conditions: [stringValueCondition]
      })

      const { error } = formDefinitionV2Schema.validate(refConditionComponentIdDefinition)

      expect(error).toBeDefined()

      if (!error) {
        throw new Error('Unexpected empty error')
      }

      const err = new InvalidFormDefinitionError(error)
      jest.mocked(addConditionToDraftFormDefinition).mockRejectedValueOnce(err)

      const response = await server.inject({
        method: 'POST',
        url: `/forms/${id}/definition/draft/conditions`,
        payload,
        auth
      })

      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({
        error: 'InvalidFormDefinitionError',
        message: '"conditions[0].items[0].componentId" must be [ref:root:pages]',
        statusCode: 400,
        cause: err.cause
      })
    })
  })
})

/**
 * @import { Server } from '@hapi/hapi'
 * @import { ConditionWrapperV2, ConditionDataV2 } from '@defra/forms-model'
 */
