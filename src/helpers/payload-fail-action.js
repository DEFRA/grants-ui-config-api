import { getErrorMessage } from '@defra/forms-model'
import Boom from '@hapi/boom'
import Joi from 'joi'

import { InvalidFormDefinitionError } from '~/src/api/forms/errors.js'

/**
 * Checks for a Boom and Joi error from the
 * payload and throws an `InvalidFormDefinitionError`
 * @param {Error | undefined} err
 */
export const checkError = (err) => {
  // NOTE - when running locally (or unit testing) and using 'npm link' to share the forms-model,
  // Joi.isError() will fail as it calls 'instanceof' and the derivations are from separate packages.
  // Comment out 'Joi.isError(err)' to test locally.
  if (Boom.isBoom(err) && Joi.isError(err)) {
    /** @type {{ source?: string } | undefined} */
    // @ts-expect-error - unknown type
    const validation = err.output.payload.validation

    if (validation?.source === 'payload') {
      throw new InvalidFormDefinitionError(err)
    }
  }

  return err ?? new Error('Unknown error')
}

/**
 * @type {Lifecycle.Method}
 */
export const failAction = (request, _h, err) => {
  request.logger.error(err, `[validationFailed] Request validation failed - ${getErrorMessage(err)}`)

  return checkError(err)
}

/**
 * @import { Lifecycle } from '@hapi/hapi'
 */
