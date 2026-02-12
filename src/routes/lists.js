import { Scopes, listSchemaV2 } from '@defra/forms-model'

import {
  addListToDraftFormDefinition,
  removeListOnDraftFormDefinition,
  updateListOnDraftFormDefinition
} from '~/src/api/forms/service/lists.js'
import { getAuthor } from '~/src/helpers/get-author.js'
import { failAction } from '~/src/helpers/payload-fail-action.js'
import { formByIdSchema, listByIdSchema, listSchemaWithRequiredIdSchema } from '~/src/models/forms.js'

export const ROUTE_LISTS = '/forms/{id}/definition/draft/lists/{listId}'

/**
 * @type {ServerRoute[]}
 */
export default [
  {
    method: 'POST',
    path: '/forms/{id}/definition/draft/lists',
    /**
     * @param {CreateListDraftFormPagesRequest} request
     */
    async handler(request) {
      const { auth, params, payload } = request
      const { id } = params
      const author = getAuthor(auth.credentials.user)

      const list = await addListToDraftFormDefinition(id, payload, author)

      return {
        id: list.id,
        list,
        status: 'created'
      }
    },
    options: {
      auth: {
        scope: [`+${Scopes.FormEdit}`]
      },
      validate: {
        params: formByIdSchema,
        payload: listSchemaV2,
        failAction
      }
    }
  },
  {
    method: 'PUT',
    path: ROUTE_LISTS,
    /**
     * @param {UpdateListDraftFormPagesRequest} request
     */
    async handler(request) {
      const { auth, params, payload } = request
      const { id, listId } = params
      const author = getAuthor(auth.credentials.user)

      const updatedList = await updateListOnDraftFormDefinition(id, listId, payload, author)

      return {
        id: updatedList.id,
        list: updatedList,
        status: 'updated'
      }
    },
    options: {
      auth: {
        scope: [`+${Scopes.FormEdit}`]
      },
      validate: {
        params: listByIdSchema,
        payload: listSchemaWithRequiredIdSchema,
        failAction
      }
    }
  },
  {
    method: 'DELETE',
    path: ROUTE_LISTS,
    /**
     * @param {DeleteListDraftFormPagesRequest} request
     */
    async handler(request) {
      const { auth, params } = request
      const { id, listId } = params
      const author = getAuthor(auth.credentials.user)

      await removeListOnDraftFormDefinition(id, listId, author)

      return {
        id: listId,
        status: 'deleted'
      }
    },
    options: {
      auth: {
        scope: [`+${Scopes.FormEdit}`]
      },
      validate: {
        params: listByIdSchema
      }
    }
  }
]

/**
 * @import { ServerRoute } from '@hapi/hapi'
 * @import { CreateListDraftFormPagesRequest, UpdateListDraftFormPagesRequest, DeleteListDraftFormPagesRequest } from '~/src/api/types.js'
 */
