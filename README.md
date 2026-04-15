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
    - [Port Configuration](#port-configuration)
    - [Form Definition Metadata](#form-definition-metadata)
    - [Config Broker Integration](#config-broker-integration)
    - [Type Definitions](#type-definitions)
    - [Deployment](#deployment)
  - [API endpoints](#api-endpoints)
  - [Calling API endpoints](#calling-api-endpoints)
  - [Test coverage](#test-coverage)
    - [Unit tests](#unit-tests)
    - [Integration tests](#integration-tests)
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

3. Optionally create a `.env` file with the following environment variables populated at root level:

```text
PORT=3011
MONGO_URI=mongodb://mongodb:27017/
JWT_SECRET= <JWT secret for JWT signing>
CONFIG_BROKER_URL=http://localhost:3012
FORMS_API_SLUGS=my-grant,another-grant
```

If not provided, default values will be used so the application can be started.

The API will be available at `http://localhost:3011` once started.

**AWS Services**: The Docker Compose setup includes LocalStack for local AWS service emulation (S3 and SNS). AWS credentials and config in the `/localstack/aws.env` is used for local development.

**Audit Events**: Event-based audit publishing to SNS is disabled by default. To enable, set:

- `FEATURE_FLAG_PUBLISH_AUDIT_EVENTS=true`
- `SNS_TOPIC_ARN=<your-topic-arn>`
- `SNS_ENDPOINT=http://localstack:4566` (for local development)

**Config Broker**: On startup the API seeds form definitions from the config broker service. See [Config Broker Integration](#config-broker-integration) below.

**Proxy Configuration**: For proxy support, see https://www.npmjs.com/package/proxy-from-env which is used by https://github.com/TooTallNate/proxy-agents/tree/main/packages/proxy-agent.

### Npm scripts

All available Npm scripts can be seen in [package.json](./package.json)
To view them in your command line run:

```bash
npm run
```

### Port Configuration

The API runs on **port 3011** by default. This can be configured via the `PORT` environment variable.

### Form Definition Metadata

Form definitions support an optional `metadata` field for storing structured form metadata. Metadata validation is performed automatically when publishing forms to ensure data integrity.

For detailed information on metadata structure, validation rules, and examples, see [docs/metadata-guide.md](docs/metadata-guide.md).

### Config Broker Integration

On startup the API seeds grant form definitions from an external config broker service (`CONFIG_BROKER_URL`). The seeder:

1. Calls `GET /api/allGrants` on the config broker to retrieve all available grants and their versions.
2. Filters grants to those listed in the `FORMS_API_SLUGS` environment variable (comma-separated slugs).
3. For each grant version, calls `GET /api/version?grant=<slug>&version=<semver>` to retrieve version detail including the S3 manifest.
4. Fetches the YAML form definition from S3 using the `path` field (bucket name) and `manifest` keys from the broker response.
5. Creates or updates the form version in the database:
   - **New version**: creates form metadata (or reuses existing) and inserts the version document.
   - **Existing version, status changed**: updates the version status in the database.
   - **Existing version, same status**: skips (no-op).

Grant form versions use **semantic versioning** (e.g. `1.0.0`). Multiple versions of the same grant can be active simultaneously.

#### Environment variables

| Variable            | Description                                 | Default |
| ------------------- | ------------------------------------------- | ------- |
| `CONFIG_BROKER_URL` | Base URL of the config broker service       | `""`    |
| `FORMS_API_SLUGS`   | Comma-separated list of grant slugs to seed | `""`    |

### Type Definitions

The codebase uses JSDoc type annotations for TypeScript-style type safety without requiring TypeScript compilation. Custom type definitions are maintained in:

- **`src/api/types.js`** - API-specific types including request types and document schemas
- Form model types are imported from `@defra/forms-model`

Key custom types include:

- `FormDefinitionWithMetadata` - Form definition with required metadata field
- `FormMetadataWithVersions` - Form metadata including version history
- Various request types for API endpoints

### Deployment

The application is containerised using Docker. To build the Docker image locally, e.g. for testing with `grants-ui` compose stack:

```bash
npm run docker:build
```

This build is for local use only and is tagged with `local`.

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

### Slug endpoints with semver versioning

Config-broker-seeded forms support an optional `?version=<semver>` query parameter on the slug endpoints:

| Endpoint                            | Without `version`                                                                                 | With `version=1.0.0`                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `GET /forms/slug/{slug}`            | Returns form metadata                                                                             | Returns form metadata (version param ignored)       |
| `GET /forms/slug/{slug}/definition` | Returns latest **active** semver version; falls back to live definition for editor-workflow forms | Returns definition for the specified semver version |

Multiple semver versions can be active simultaneously. "Latest" is determined by semver comparison (not creation order).

If you're adding endpoints for new features, update the [openapi.yaml](openapi.yaml) file to include the new endpoints.

## Calling API endpoints

### Using the HTTP Client (IntelliJ/VS Code)

The project includes an HTTP client configuration file ([config.http](config.http)) that works with IntelliJ IDEA and VS Code REST Client extensions.

#### Prerequisites

1. **Generate JWT_SECRET** using the npm script:

   ```bash
   # Print JWT secret to console
   npm run generate:jwt_secret
   ```

   and paste into `.env` file.

2. **Generate an authentication token** using the npm script:

   ```bash
   # Print token to console
   npm run generate:token

   # Save token to http-client.private.env.json
   npm run generate:token:save
   ```

   The `generate:token:save` command creates/updates `http-client.private.env.json` with your token, which is automatically used by the HTTP client.

3. **Set up per environment variables**:
   - The base configuration is in [http-client.env.json](http-client.env.json)
   - Private/sensitive values (like tokens) are stored in `http-client.private.env.json` (git-ignored)
     - `authToken` - JWT token generated as above
     - `x-api-key` – obtain this per‑environment value from the CDP portal user profile page: `https://portal.cdp-int.defra.cloud/user-profile`

4. **Start the API**:

   ```bash
   npm run docker:up
   ```

5. **Execute requests**:
   - Open [config.http](config.http) in your IDE
   - Select the environment (e.g., "local") from the dropdown
   - Click "Run" on any request to execute it

The HTTP client files include examples for all API endpoints:

- **[config.http](config.http)** - Form management, pages, components, versioning, and slug endpoints with semver support
- **[broker.http](broker.http)** - Config broker service endpoints (`/api/allGrants`, `/api/version`)

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
