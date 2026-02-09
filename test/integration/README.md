# Integration Tests

This directory contains integration tests for the Grants UI Config API using Jest + Supertest.

## Overview

The integration tests have been refactored from Postman/Newman to Jest + Supertest to provide:

- Better integration with the existing Jest test suite
- Programmatic test execution without external tools
- Easier debugging and development workflow
- Version controlled test code instead of JSON collections

## Running Tests

### Run all tests (unit + integration)

```bash
npm test
```

### Run only integration tests

```bash
npm run test:integration
```

### Run integration tests in watch mode

```bash
npm run test:watch -- --testPathPattern=integration
```

## Test Structure

### Files

- `test/integration/api.integration.test.js` - Main integration test suite
- `test/helpers/auth.js` - Authentication helper for generating JWT tokens

### Test Coverage

The integration test suite covers 37 test cases equivalent to the original Postman collection:

1. **Health Check** - API health endpoint
2. **Forms CRUD** - Create, read, update, delete forms
3. **Form Definitions** - Draft and live form definitions
4. **Form Migration** - V1 to V2 engine migration
5. **Pages** - Create, update, delete, reorder pages
6. **Components** - Create, update, delete form components
7. **Lists** - Create, update, delete lists (including large lists with 100 elements)
8. **Sections** - Add and remove sections
9. **Form Options** - Configure form options like showReferenceNumber
10. **Go-Live Flow** - Complete workflow to publish a form

## Authentication

Tests use JWT tokens for authentication, generated using the `@hapi/jwt` library. The token generation helper is located in `test/helpers/auth.js`.

### JWT Token Generation

```javascript
import { generateTestToken } from '~/test/helpers/auth.js'

const token = generateTestToken()
```

By default, tokens are valid for 90 days and include:

- `serviceId`: 'test-service-001'
- `serviceName`: 'Test Service'
- All available scopes (form-read, form-edit, form-delete, form-publish)

## Test Flow

Tests run sequentially and maintain state between tests using a `testState` object. This mirrors the Postman collection approach where collection variables stored IDs between requests.

Example flow:

1. Create a form → Store `formId`
2. Add pages to form → Store `pageId`, `pageId2`, `pageId3`
3. Reorder pages using stored IDs
4. Clean up by deleting form using stored `formId`

## Migrating from Postman

The Postman collection (`test/integration/postman/`) is still available for reference but is no longer the primary integration testing method. The new Jest + Supertest approach provides the same test coverage with these advantages:

### Before (Postman/Newman):

```bash
npm run test:integration:setup
npm run test:integration:start
npm run test:integration:wait
npm run test:integration:run
npm run test:integration:stop
```

### After (Jest + Supertest):

```bash
npm run test:integration
```

## Configuration

### Jest Configuration

Integration tests are included in `jest.config.cjs`:

- `testMatch`: Includes `test/**/*.test.{cjs,js,mjs}`
- `testPathIgnorePatterns`: Excludes the Postman collection directory

### Environment Variables

The JWT secret is read from environment variables or defaults to 'change-me-in-production':

- `JWT_SECRET` - Secret for signing JWT tokens (configured in `.env`)

## Debugging

### Debug a specific test

```bash
npm run test:integration -- -t "should create a new form"
```

### View detailed output

```bash
npm run test:integration -- --verbose
```

### Run with coverage

```bash
npm run test -- --testPathPattern=integration --coverage
```

## Best Practices

1. **Sequential Execution**: Tests in the main suite run sequentially as they depend on state from previous tests
2. **Cleanup**: Always clean up created resources (forms, pages, etc.)
3. **Assertions**: Use specific assertions that match the Postman test equivalents
4. **Token Management**: Tokens are generated once per test suite in `beforeAll`
5. **State Management**: Use `testState` object to pass data between sequential tests

## Troubleshooting

### Tests failing due to authentication

- Verify `JWT_SECRET` in your `.env` file matches the server configuration
- Check that the token generation includes all required scopes

### Tests timing out

- Increase timeout: `jest.setTimeout(60000)` in test file
- Check server initialization in `beforeAll`

### State issues between tests

- Ensure tests run sequentially (not in parallel)
- Verify cleanup in `afterAll` and cleanup tests
