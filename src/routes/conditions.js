import { Scopes, conditionWrapperSchemaV2 } from '@defra/forms-model'

import {
  addConditionToDraftFormDefinition,
  removeConditionOnDraftFormDefinition,
  updateConditionOnDraftFormDefinition
} from '~/src/api/forms/service/conditions.js'
import { getAuthor } from '~/src/helpers/get-author.js'
import { conditionByIdSchema, formByIdSchema } from '~/src/models/forms.js'

export const ROUTE_CONDITIONS = '/forms/{id}/definition/draft/conditions/{conditionId}'

/**
 * @type {ServerRoute[]}
 */
export default [
  {
    method: 'POST',
    path: '/forms/{id}/definition/draft/conditions',
    /**
     * @param {CreateConditionDraftFormPagesRequest} request
     */
    async handler(request) {
      const { auth, params, payload } = request
      const { id } = params
      const author = getAuthor(auth.credentials.user)

      const condition = await addConditionToDraftFormDefinition(id, payload, author)

      return {
        id: condition.id,
        condition,
        status: 'created'
      }
    },
    options: {
      auth: {
        scope: [`+${Scopes.FormEdit}`]
      },
      validate: {
        params: formByIdSchema,
        payload: conditionWrapperSchemaV2
      }
    }
  },
  {
    method: 'PUT',
    path: ROUTE_CONDITIONS,
    /**
     * @param {UpdateConditionDraftFormPagesRequest} request
     */
    async handler(request) {
      const { auth, params, payload } = request
      const { id, conditionId } = params
      const author = getAuthor(auth.credentials.user)

      const updatedCondition = await updateConditionOnDraftFormDefinition(id, conditionId, payload, author)

      return {
        id: updatedCondition.id,
        condition: updatedCondition,
        status: 'updated'
      }
    },
    options: {
      auth: {
        scope: [`+${Scopes.FormEdit}`]
      },
      validate: {
        params: conditionByIdSchema,
        payload: conditionWrapperSchemaV2
      }
    }
  },
  {
    method: 'DELETE',
    path: ROUTE_CONDITIONS,
    /**
     * @param {DeleteConditionDraftFormPagesRequest} request
     */
    async handler(request) {
      const { auth, params } = request
      const { id, conditionId } = params
      const author = getAuthor(auth.credentials.user)

      await removeConditionOnDraftFormDefinition(id, conditionId, author)

      return {
        id: conditionId,
        status: 'deleted'
      }
    },
    options: {
      auth: {
        scope: [`+${Scopes.FormEdit}`]
      },
      validate: {
        params: conditionByIdSchema
      }
    }
  }
]

/**
 * @import { ServerRoute } from '@hapi/hapi'
 * @import { CreateConditionDraftFormPagesRequest, UpdateConditionDraftFormPagesRequest, DeleteConditionDraftFormPagesRequest } from '~/src/api/types.js'
 */
