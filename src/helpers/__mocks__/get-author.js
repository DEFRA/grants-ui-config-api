import author from '~/src/api/forms/service/__stubs__/author.js'

/**
 * Get the author from the auth credentials
 * @returns {FormMetadataAuthor}
 */
export function getAuthor() {
  return author
}

/**
 * @import { FormMetadataAuthor } from '@defra/forms-model'
 * @import { UserCredentials } from '@hapi/hapi'
 */
