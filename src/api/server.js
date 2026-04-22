import path from 'path'

import hapi from '@hapi/hapi'
import Wreck from '@hapi/wreck'
import { ProxyAgent } from 'proxy-agent'

import { config } from '~/src/config/index.js'
import { failAction } from '~/src/helpers/fail-action.js'
import { requestLogger } from '~/src/helpers/logging/request-logger.js'
import { requestTracing } from '~/src/helpers/request-tracing.js'
import { prepareDb } from '~/src/mongo.js'
import { seedFormsFromConfigBroker } from '~/src/api/forms/service/config-broker-seeder.js'
import { auth } from '~/src/plugins/auth/index.js'
import { queryHandler } from '~/src/plugins/query-handler/index.js'
import { router } from '~/src/plugins/router.js'
import { transformErrors } from '~/src/plugins/transform-errors.js'
import { prepareSecureContext } from '~/src/secure-context.js'

const isProduction = config.get('isProduction')

const proxyAgent = new ProxyAgent()

Wreck.agents = {
  https: proxyAgent,
  http: proxyAgent,
  httpsAllowUnauthorized: proxyAgent
}

/**
 * Creates the Hapi server
 */
export async function createServer() {
  const server = hapi.server({
    port: config.get('port'),
    routes: {
      auth: {
        mode: 'required'
      },
      validate: {
        options: {
          abortEarly: false
        },
        failAction
      },
      files: {
        relativeTo: path.resolve(config.get('root'), '.public')
      },
      security: {
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: false
        },
        xss: 'enabled',
        noSniff: true,
        xframe: true
      }
    },
    router: {
      stripTrailingSlash: true
    }
  })

  await server.register(auth)
  await server.register(requestLogger)
  await server.register(requestTracing)
  await server.register(queryHandler)

  if (isProduction) {
    prepareSecureContext((message) => {
      server.logger.info(message)
    })
  }

  await prepareDb(server.logger)
  await seedFormsFromConfigBroker()
  await server.register(transformErrors)
  await server.register(router)

  return server
}
