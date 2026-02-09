export const auth = {
  strategy: 'jwt-service',
  credentials: {
    user: {
      id: 'test-service-001',
      displayName: 'Test Service'
    },
    // Add all scopes for testing (admin level access)
    scope: ['form-delete', 'form-edit', 'form-read', 'form-publish']
  }
}
