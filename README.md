# grants-ui-config-api

## About this fork

This repository is a fork of [DEFRA/forms-manager](https://github.com/DEFRA/forms-manager). It is maintained as a separate copy due to the service requirements of the Core Delivery Platform (CDP).

- [grants-ui-config-api](#grants-ui-config-api)
  - [About this fork](#about-this-fork)
  - [Requirements](#requirements)
    - [Node.js](#nodejs)
  - [Local development](#local-development)
    - [Setup](#setup)
    - [Npm scripts](#npm-scripts)
    - [Database Migrations](#database-migrations)
      - [Production](#production)
      - [Local Development](#local-development-1)
        - [Option 1: Using Docker Compose (Recommended)](#option-1-using-docker-compose-recommended)
        - [Option 2: Manual Migration Commands](#option-2-manual-migration-commands)
  - [API endpoints](#api-endpoints)
  - [Calling API endpoints](#calling-api-endpoints)
  - [Licence](#licence)
    - [About the licence](#about-the-licence)

## Requirements

### Node.js

Please install the Node.js version in [.nvmrc](.nvmrc) using [Node Version Manager `nvm`](https://github.com/creationix/nvm) via:

```bash
cd grants-ui-config-api
nvm use
```

## Local development

### Setup

1. Install Docker

2. Start compose stack

```bash
docker compose up
```

or

```bash
npm run docker:up
```

3. Create a `.env` file with the following mandatory environment variables populated at root level:

```text
MONGO_URI=""
MONGO_DATABASE=""
HTTP_PROXY=
HTTPS_PROXY=
NO_PROXY=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```

Event-based audit publishing to SNS is disabled by default. To enable, set `FEATURE_FLAG_PUBLISH_AUDIT_EVENTS=true`, `SNS_TOPIC_ARN`, and optionally `SNS_ENDPOINT` (e.g. for LocalStack).

For proxy options, see https://www.npmjs.com/package/proxy-from-env which is used by https://github.com/TooTallNate/proxy-agents/tree/main/packages/proxy-agent. It's currently supports Hapi Wreck only, e.g. in the JWKS lookup.

### Npm scripts

All available Npm scripts can be seen in [package.json](./package.json)
To view them in your command line run:

```bash
npm run
```

### Database Migrations

This project uses [migrate-mongo](https://www.npmjs.com/package/migrate-mongo) to manage database migrations.

#### Production

In production, migrations run automatically when the Docker container starts via the `scripts/run-migrations-and-start.sh` shell script. This script:

1. Runs all pending migrations (`migrate-mongo up`)
2. Starts the application server
3. Logs migration progress to the container output

**No manual intervention is required** - migrations execute automatically on container startup.

#### Local Development

For local development, you have two options:

##### Option 1: Using Docker Compose (Recommended)

Migrations run automatically when using Docker:

```bash
docker compose up --build grants-ui-config-api
```

This mimics the production environment and runs migrations via the same shell script.

##### Option 2: Manual Migration Commands

To work with migrations manually, you can install migrate-mongo globally:

```bash
npm install -g migrate-mongo
```

Available migration commands:

```bash
# Check migration status
npm run migrate:status

# Run all pending migrations
npm run migrate:up

# Rollback the last migration
npm run migrate:down

# Create a new migration
npx migrate-mongo create <migration-name> -f migrate-mongo-config.js
```

**Important**: When running migrations manually, ensure your `.env` file contains the correct `MONGO_URI` and `MONGO_DATABASE` values that match your local MongoDB instance.

## API endpoints

The API follows the OpenAPI 3.1 specification. View the complete API documentation:

- **[openapi.yaml](openapi.yaml)** - Complete OpenAPI specification

The API provides endpoints for:

- **Health** - Service health checks
- **Forms** - Form metadata and lifecycle management (create, read, update, delete)
- **Definitions** - Draft and live form definition management
- **Versions** - Form version history and retrieval
- **Pages** - Page management within form definitions
- **Components** - Component management within pages

Most endpoints require JWT Bearer token authentication. See [Calling API endpoints](#calling-api-endpoints) below for authentication setup.

If you're adding endpoints for new features, update the [openapi.yaml](openapi.yaml) file to include the new endpoints.

The CI pipeline will automatically run your new test along with the existing ones on PRs and merges to main.

## Calling API endpoints

### Using the HTTP Client (IntelliJ/VS Code)

The project includes an HTTP client configuration file ([config.http](config.http)) that works with IntelliJ IDEA and VS Code REST Client extensions.

#### Prerequisites

1. **Generate an authentication token** using the npm script:

   ```bash
   # Print token to console
   npm run generate:token

   # Save token to http-client.private.env.json
   npm run generate:token:save
   ```

   The `generate:token:save` command creates/updates `http-client.private.env.json` with your token, which is automatically used by the HTTP client.

2. **Set up environment variables**:
   - The base configuration is in [http-client.env.json](http-client.env.json)
   - Private/sensitive values (like tokens) are stored in `http-client.private.env.json` (git-ignored)

3. **Start the API**:

   ```bash
   npm run docker:up
   ```

4. **Execute requests**:
   - Open [config.http](config.http) in your IDE
   - Select the environment (e.g., "local") from the dropdown
   - Click "Run" on any request to execute it

The HTTP client file includes examples for all API endpoints including form management, pages, components, and versioning.

## Test coverage

The project includes unit and integration tests, which are run automatically on CI.

You can also run tests locally (unit and integration):

```bash
npm run test
```

### Unit tests

#### Running Unit Tests

```bash
npm run test:unit
```

#### Run unit tests in watch mode

```bash
npm run test:unit:watch
```

### Integration tests

#### Running Integration Tests

```bash
npm run test:integration
```

#### Run integration tests in watch mode

```bash
npm run test:integration:watch
```

#### Test Structure

##### Files

- `test/integration/api.integration.test.js` - Main integration test suite
- `test/helpers/auth.js` - Authentication helper for generating JWT tokens

##### Test Coverage

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

#### Authentication

Tests use JWT tokens for authentication, generated using the `@hapi/jwt` library. The token generation helper is located in `test/helpers/auth.js`.

##### JWT Token Generation

```javascript
import { generateTestToken } from '~/test/helpers/auth.js'

const token = generateTestToken()
```

By default, tokens are valid for 90 days and include:

- `serviceId`: 'test-service-001'
- `serviceName`: 'Test Service'
- All available scopes (form-read, form-edit, form-delete, form-publish)

#### Test Flow

Tests run sequentially and maintain state between tests using a `testState` object. This mirrors the Postman collection approach where collection variables stored IDs between requests.

Example flow:

1. Create a form → Store `formId`
2. Add pages to form → Store `pageId`, `pageId2`, `pageId3`
3. Reorder pages using stored IDs
4. Clean up by deleting form using stored `formId`

#### Configuration

##### Jest Configuration

Integration tests are included in `jest.config.cjs`:

- `testMatch`: Includes `test/**/*.test.{cjs,js,mjs}`
- `testPathIgnorePatterns`: Excludes the Postman collection directory

##### Environment Variables

The JWT secret is read from environment variables or defaults to 'change-me-in-production':

- `JWT_SECRET` - Secret for signing JWT tokens (configured in `.env`)

#### Debugging

##### Debug a specific test

```bash
npm run test:integration -- -t "should create a new form"
```

##### View detailed output

```bash
npm run test:integration -- --verbose
```

##### Run with coverage

```bash
npm run test -- --testPathPattern=integration --coverage
```

#### Best Practices

1. **Sequential Execution**: Tests in the main suite run sequentially as they depend on state from previous tests
2. **Cleanup**: Always clean up created resources (forms, pages, etc.)
3. **Assertions**: Use specific assertions that match the Postman test equivalents
4. **Token Management**: Tokens are generated once per test suite in `beforeAll`
5. **State Management**: Use `testState` object to pass data between sequential tests

#### Troubleshooting

##### Tests failing due to authentication

- Verify `JWT_SECRET` in your `.env` file matches the server configuration
- Check that the token generation includes all required scopes

##### Tests timing out

- Increase timeout: `jest.setTimeout(60000)` in test file
- Check server initialization in `beforeAll`

##### State issues between tests

- Ensure tests run sequentially (not in parallel)
- Verify cleanup in `afterAll` and cleanup tests

## Licence

THIS INFORMATION IS LICENSED UNDER THE CONDITIONS OF THE OPEN GOVERNMENT LICENCE found at:

<http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3>

The following attribution statement MUST be cited in your products and applications when using this information.

> Contains public sector information licensed under the Open Government license v3

### About the licence

The Open Government Licence (OGL) was developed by the Controller of Her Majesty's Stationery Office (HMSO) to enable
information providers in the public sector to license the use and re-use of their information under a common open
licence.

It is designed to encourage use and re-use of information freely and flexibly, with only a few conditions.
