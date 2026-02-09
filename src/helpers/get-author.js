import Boom from '@hapi/boom'

/**
 * Get the author from the auth credentials
 * @param {import('@hapi/hapi').UserCredentials} [user]
 * @returns {FormMetadataAuthor}
 */
export function getAuthor(user) {
  if (!user?.id || !user.displayName) {
    throw Boom.unauthorized('Failed to get the author. User is undefined or has a malformed/missing id/displayName.')
  }

  return {
    id: user.id,
    displayName: user.displayName
  }
}

/**
 * @import { FormMetadataAuthor } from '@defra/forms-model'
 */
