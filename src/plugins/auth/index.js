import Jwt from '@hapi/jwt'

import { getDefaultScopes } from '~/src/api/entitlements/service.js'
import { config } from '~/src/config/index.js'
import { createLogger } from '~/src/helpers/logging/logger.js'

const jwtSecret = config.get('jwtSecret')

const logger = createLogger()

/**
 * Validates service credentials from JWT token
 * @param {Artifacts<ServiceCredentials>} artifacts - JWT artifacts
 * @returns {{ isValid: boolean, credentials?: any }} Validation result
 */
function validateServiceCredentials(artifacts) {
  const payload = artifacts.decoded.payload

  if (!payload) {
    logger.info('[authMissingPayload] Auth: Missing payload from token.')
    return {
      isValid: false
    }
  }

  const { serviceId, serviceName } = payload

  if (!serviceId || !serviceName) {
    logger.info('[authMissingFields] Auth: Missing required fields (serviceId or serviceName) in token payload.')
    return {
      isValid: false
    }
  }

  const scopes = getDefaultScopes()

  return {
    isValid: true,
    credentials: {
      user: {
        id: serviceId,
        displayName: serviceName
      },
      scope: scopes
    }
  }
}

/**
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const auth = {
  plugin: {
    name: 'auth',
    async register(server) {
      await server.register(Jwt)

      server.auth.strategy('jwt-service', 'jwt', {
        keys: jwtSecret,
        verify: {
          aud: false,
          iss: false,
          sub: false,
          nbf: true,
          exp: true
        },
        validate: validateServiceCredentials
      })

      // Set as the default strategy
      server.auth.default('jwt-service')
    }
  }
}

/**
 * @typedef {object} ServiceCredentials
 * @property {string} serviceId - Unique identifier for the service
 * @property {string} serviceName - Display name of the service
 */

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 * @import { Artifacts } from '~/src/plugins/auth/types.js'
 */
