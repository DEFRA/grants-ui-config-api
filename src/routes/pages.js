import { Scopes, pagePayloadSchemaV2 } from '@defra/forms-model'

import { reorderDraftFormDefinitionPages } from '~/src/api/forms/service/definition.js'
import {
  createPageOnDraftDefinition,
  deletePageOnDraftDefinition,
  patchFieldsOnDraftDefinitionPage
} from '~/src/api/forms/service/page.js'
import { getAuthor } from '~/src/helpers/get-author.js'
import { formByIdSchema, pageByIdSchema, patchPageSchema, sortIdsSchema } from '~/src/models/forms.js'

export const ROUTE_PAGES = '/forms/{id}/definition/draft/pages/{pageId}'

/**
 * @type {ServerRoute[]}
 */
export default [
  {
    method: 'POST',
    path: '/forms/{id}/definition/draft/pages',
    /**
     * @param {RequestPage} request
     */
    handler(request) {
      const { auth, params, payload } = request
      const author = getAuthor(auth.credentials.user)

      return createPageOnDraftDefinition(params.id, payload, author)
    },
    options: {
      auth: {
        scope: [`+${Scopes.FormEdit}`]
      },
      validate: {
        params: formByIdSchema,
        payload: pagePayloadSchemaV2
      }
    }
  },
  {
    method: 'POST',
    path: '/forms/{id}/definition/draft/pages/order',
    /**
     * @param {SortDraftFormPagesRequest} request
     */
    handler(request) {
      const { auth, params, payload } = request
      const author = getAuthor(auth.credentials.user)

      return reorderDraftFormDefinitionPages(params.id, payload, author)
    },
    options: {
      auth: {
        scope: [`+${Scopes.FormEdit}`]
      },
      validate: {
        params: formByIdSchema,
        payload: sortIdsSchema
      }
    }
  },
  {
    method: 'PATCH',
    path: ROUTE_PAGES,
    /**
     * @param {PatchPageRequest} request
     */
    handler(request) {
      const { auth, params, payload } = request
      const author = getAuthor(auth.credentials.user)

      return patchFieldsOnDraftDefinitionPage(params.id, params.pageId, /** @type {Partial<Page>} */ (payload), author)
    },
    options: {
      auth: {
        scope: [`+${Scopes.FormEdit}`]
      },
      validate: {
        params: pageByIdSchema,
        payload: patchPageSchema
      }
    }
  },
  {
    method: 'DELETE',
    path: ROUTE_PAGES,
    /**
     * @param {DeletePageDraftFormRequest} request
     */
    async handler(request) {
      const { auth, params } = request
      const { id, pageId } = params
      const author = getAuthor(auth.credentials.user)

      await deletePageOnDraftDefinition(id, pageId, author)

      return {
        id: pageId,
        status: 'deleted'
      }
    },
    options: {
      auth: {
        scope: [`+${Scopes.FormEdit}`]
      },
      validate: {
        params: pageByIdSchema
      }
    }
  }
]

/**
 * @import { ServerRoute } from '@hapi/hapi'
 * @import { RequestPage, PatchPageRequest, SortDraftFormPagesRequest, DeletePageDraftFormRequest } from '~/src/api/types.js'
 * @import { Page } from '@defra/forms-model'
 */
