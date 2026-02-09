import { Scopes, componentPayloadSchemaV2 } from '@defra/forms-model'

import {
  createComponentOnDraftDefinition,
  deleteComponentOnDraftDefinition,
  updateComponentOnDraftDefinition
} from '~/src/api/forms/service/component.js'
import { reorderDraftFormDefinitionComponents } from '~/src/api/forms/service/definition.js'
import { getAuthor } from '~/src/helpers/get-author.js'
import { failAction } from '~/src/helpers/payload-fail-action.js'
import {
  componentByIdSchema,
  componentPayloadWithRequiredIdSchema,
  pageByIdSchema,
  prependQuerySchema,
  sortIdsSchema
} from '~/src/models/forms.js'

export const ROUTE_COMPONENTS = '/forms/{id}/definition/draft/pages/{pageId}/components/{componentId}'

/**
 * @type {ServerRoute[]}
 */
export default [
  {
    method: 'POST',
    path: '/forms/{id}/definition/draft/pages/{pageId}/components',
    /**
     * @param {RequestComponent} request
     */
    async handler(request) {
      const { auth, params, payload, query } = request
      const { id, pageId } = params
      const { prepend } = query

      const author = getAuthor(auth.credentials.user)
      const component = await createComponentOnDraftDefinition(id, pageId, payload, author, prepend)

      return component
    },
    options: {
      auth: {
        scope: [`+${Scopes.FormEdit}`]
      },
      validate: {
        params: pageByIdSchema,
        payload: componentPayloadSchemaV2,
        query: prependQuerySchema,
        failAction
      }
    }
  },
  {
    method: 'POST',
    path: '/forms/{id}/definition/draft/page/{pageId}/components/order',
    /**
     * @param {SortDraftFormComponentsRequest} request
     */
    handler(request) {
      const { auth, params, payload } = request
      const author = getAuthor(auth.credentials.user)

      return reorderDraftFormDefinitionComponents(params.id, params.pageId, payload, author)
    },
    options: {
      auth: {
        scope: [`+${Scopes.FormEdit}`]
      },
      validate: {
        params: pageByIdSchema,
        payload: sortIdsSchema,
        failAction
      }
    }
  },
  {
    method: 'PUT',
    path: ROUTE_COMPONENTS,
    /**
     * @param {RequestUpdateComponent} request
     */
    handler(request) {
      const { auth, params, payload } = request
      const { id, pageId, componentId } = params

      const author = getAuthor(auth.credentials.user)
      return updateComponentOnDraftDefinition(id, pageId, componentId, payload, author)
    },
    options: {
      auth: {
        scope: [`+${Scopes.FormEdit}`]
      },
      validate: {
        params: componentByIdSchema,
        payload: componentPayloadWithRequiredIdSchema,
        failAction
      }
    }
  },
  {
    method: 'DELETE',
    path: ROUTE_COMPONENTS,
    /**
     * @param {RequestUpdateComponent} request
     */
    async handler(request) {
      const { auth, params } = request
      const { id, pageId, componentId } = params

      const author = getAuthor(auth.credentials.user)
      await deleteComponentOnDraftDefinition(id, pageId, componentId, author)

      return {
        componentId,
        status: 'deleted'
      }
    },
    options: {
      auth: {
        scope: [`+${Scopes.FormEdit}`]
      },
      validate: {
        params: componentByIdSchema,
        failAction
      }
    }
  }
]

/**
 * @import { ServerRoute } from '@hapi/hapi'
 * @import { RequestComponent, RequestUpdateComponent, SortDraftFormComponentsRequest } from '~/src/api/types.js'
 */
