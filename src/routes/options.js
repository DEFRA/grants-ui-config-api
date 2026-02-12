import { Scopes } from '@defra/forms-model'
import Joi from 'joi'

import { updateOptionOnDraftDefinition } from '~/src/api/forms/service/options.js'
import { getAuthor } from '~/src/helpers/get-author.js'
import { failAction } from '~/src/helpers/payload-fail-action.js'
import { optionByNameSchema } from '~/src/models/forms.js'

export const ROUTE_OPTIONS = '/forms/{id}/definition/draft/options/{optionName}'

const optionPayloadSchema = Joi.object({
  optionValue: Joi.string().required()
})

/**
 * @type {ServerRoute[]}
 */
export default [
  {
    method: 'POST',
    path: ROUTE_OPTIONS,
    /**
     * @param {RequestOption} request
     */
    async handler(request) {
      const { auth, params, payload } = request
      const { id, optionName } = params

      const author = getAuthor(auth.credentials.user)
      const option = await updateOptionOnDraftDefinition(id, optionName, payload.optionValue, author)

      return option
    },
    options: {
      auth: {
        scope: [`+${Scopes.FormEdit}`]
      },
      validate: {
        params: optionByNameSchema,
        payload: optionPayloadSchema,
        failAction
      }
    }
  }
]

/**
 * @import { ServerRoute } from '@hapi/hapi'
 * @import { RequestOption } from '~/src/api/types.js'
 */
