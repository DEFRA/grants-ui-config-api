import { UserCredentials } from '@hapi/hapi'

declare module '@hapi/hapi' {
  interface UserCredentials {
    /**
     * ID of the service account
     */
    id?: string

    /**
     * Name of the service account
     */
    displayName?: string
  }
}
