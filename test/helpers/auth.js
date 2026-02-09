import Jwt from '@hapi/jwt'

/**
 * Generates a JWT token for testing
 * @param {string} jwtSecret - JWT secret for signing
 * @param {object} [options] - Token options
 * @param {string} [options.serviceId] - Service ID
 * @param {string} [options.serviceName] - Service name
 * @param {number} [options.expiresIn] - Token expiration in seconds
 * @returns {string} JWT token
 */
export function generateTestToken(
  jwtSecret = 'change-me-in-production',
  { serviceId = 'test-service-001', serviceName = 'Test Service', expiresIn = 86400 * 90 } = {}
) {
  const now = Math.floor(Date.now() / 1000)

  return Jwt.token.generate(
    {
      serviceId,
      serviceName,
      iat: now,
      nbf: now,
      exp: now + expiresIn
    },
    {
      key: jwtSecret,
      algorithm: 'HS256'
    }
  )
}
