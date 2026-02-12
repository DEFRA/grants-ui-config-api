/**
 * JWT Token Generator for HTTP Client Testing
 *
 * Generates a JWT token for service-to-service authentication testing.
 * The token is signed using the JWT_SECRET from your .env file and contains
 * serviceId and serviceName claims with a 90-day expiration.
 *
 * Usage:
 *   npm run generate:token              # Prints token to console
 *   npm run generate:token:save         # Saves token to http-client.private.env.json
 *
 * The --save flag will automatically update or create http-client.private.env.json
 * and store the token under the "local" environment's "authToken" field.
 */

import { readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

import 'dotenv/config'
import Jwt from '@hapi/jwt'

const jwtSecret = process.env.JWT_SECRET

if (!jwtSecret) {
  throw new Error(
    'JWT_SECRET environment variable is not set. Set it in your .env file or export it before running this script.'
  )
}

const token = Jwt.token.generate(
  {
    serviceId: 'test-service-001',
    serviceName: 'Test Service',
    iat: Math.floor(Date.now() / 1000),
    nbf: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400 * 90 // expires in 90 days
  },
  {
    key: jwtSecret,
    algorithm: 'HS256'
  }
)

const shouldUpdateFile = process.argv.includes('--save')

if (shouldUpdateFile) {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url))
    const httpClientEnvPath = join(__dirname, '..', 'http-client.private.env.json')

    /** @type {any} */
    let config = {}

    try {
      const fileContent = await readFile(httpClientEnvPath, 'utf-8')
      config = JSON.parse(fileContent)
    } catch (/** @type {any} */ error) {
      // File doesn't exist, will create it with empty config
      if (error.code !== 'ENOENT') {
        throw error
      }
    }

    // Update the local environment token
    config.local ??= {}
    config.local.authToken = token

    await writeFile(httpClientEnvPath, JSON.stringify(config, null, 2) + '\n', 'utf-8')

    console.log('Token generated and saved to http-client.private.env.json under "local" environment')
    console.log(token)
  } catch (/** @type {any} */ error) {
    console.error('Error updating http-client.private.env.json:', error.message)
    throw error
  }
} else {
  console.log(token)
}
