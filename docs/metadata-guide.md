# Grant Definition Metadata Guide

This guide describes all available metadata properties in grant definition YAML files and how they're used in the application.

## Table of Contents

- [Overview](#overview)
- [Core Properties](#core-properties)
  - [id](#id)
  - [enabledInProd](#enabledinprod)
  - [referenceNumberPrefix](#referencenumberprefix)
- [Cookie Consent](#cookie-consent)
- [Submission Configuration](#submission-configuration)
- [Grant Redirect Rules](#grant-redirect-rules)
- [Confirmation Content](#confirmation-content)
- [Whitelist Configuration](#whitelist-configuration)
- [Details Page Configuration](#details-page-configuration)
- [Task List Configuration](#task-list-configuration)
- [Reference](#reference)

---

## Overview

All metadata properties are defined under the `metadata` key in grant definition YAML files located in `src/server/common/forms/definitions/`.
The metadata is accessible throughout the application via `request.app.model.def.metadata` inside any controllers that extend DXT base controllers.

---

## Core Properties

### id

**Type**: `string` (UUID)

**Required**: Yes

Unique identifier for the grant definition. Used internally by the forms engine to register and retrieve form definitions.

**Key files**:

- `src/server/common/forms/services/form.js`

**Usage**:

```yaml
metadata:
  id: f298fa47-0ebb-4c92-a0aa-3d0faed71aab
```

---

### enabledInProd

**Type**: `boolean`

**Required**: No (defaults to `false`)

Controls whether the grant is visible in production environments. When `false`, the grant is only available in development, test, and local environments.

**Key files**:

- `src/server/common/forms/services/form.js` (lines 227, 245–248)

**Usage**:

```yaml
metadata:
  enabledInProd: true
```

**Behavior**:

- In production (`cdpEnvironment: 'prod'`): Only grants with `enabledInProd: true` are loaded
- In non-production: All grants are loaded regardless of this flag
- Allows safe development and testing without exposing incomplete grants to users

---

### referenceNumberPrefix

**Type**: `string`

**Required**: No

Custom prefix for generated application reference numbers.
When set, reference numbers follow the format `PREFIX-XXX-XXX`.
Without a prefix, the format is `XXX-XXX-XXX`.

**Key files**:

- Forms Engine Plugin: `node_modules/@defra/forms-engine-plugin/.server/server/plugins/engine/referenceNumbers.js`

**Usage**:

```yaml
metadata:
  referenceNumberPrefix: EGWT
```

**Generated reference examples**:

- With prefix: `EGWT-a3f-2b9`
- Without prefix: `abc-def-123`

**Notes**:

- Uses `crypto.randomBytes()` for hexadecimal generation
- Stored in state as `$$__referenceNumber`
- Persists throughout the application lifecycle
- Displayed on confirmation pages and used in submissions

---

## Cookie Consent

**Type**: `object`
**Required**: No

Configures the cookie consent banner and policy for the grant. If not specified, falls back to global configuration.

**Key files**:

- `src/config/nunjucks/context/context.js` (lines 43-51)
- `src/config/nunjucks/context/build-cookie-banner-config.js`

**Properties**:

| Property          | Type    | Required | Description                                                     |
| ----------------- | ------- | -------- | --------------------------------------------------------------- |
| `enabled`         | boolean | Yes      | Whether to show cookie consent banner                           |
| `serviceName`     | string  | Yes      | Service name displayed in banner (e.g. "Farm and land service") |
| `cookiePolicyUrl` | string  | Yes      | URL to cookie policy page                                       |
| `expiryDays`      | number  | Yes      | Cookie lifespan in days                                         |

**Usage**:

```yaml
metadata:
  cookieConsent:
    enabled: true
    serviceName: Farm and land service
    cookiePolicyUrl: /cookies
    expiryDays: 365
```

**Notes**:

- Creates GOV.UK Design System compatible banner
- Includes Accept/Reject buttons
- Handles Google Analytics tracking if enabled
- Provides noscript fallback

---

## Submission Configuration

**Type**: `object`

**Required**: Yes

Configures how the grant application is submitted to the Grant Administration Service (GAS).

**Key files**:

- `src/server/common/forms/services/submission.js`
- `src/server/declaration/declaration-page.controller.js`

**Properties**:

| Property               | Type   | Required | Description                               |
| ---------------------- | ------ | -------- | ----------------------------------------- |
| `grantCode`            | string | Yes      | Unique code identifying the grant for GAS |
| `submissionSchemaPath` | string | Yes      | Path to JSON schema for validation        |

**Usage**:

```yaml
metadata:
  submission:
    grantCode: example-grant-with-task-list
    submissionSchemaPath: ./schemas/example-grant-with-auth-submission.schema.json
```

**grantCode details**:

- Used as identifier in GAS API calls
- Must match a configured JSON schema
- Used in state caching as `{sbi, grantCode}` key
- Required for reference number generation (done in DXT plugin)

**submissionSchemaPath details**:

- Relative to `src/server/common/forms/schemas/` directory
- Uses AJV (Another JSON Validator) with 2020 schema
- Validates submission payload before sending to GAS
- Compilation happens at application startup
- Validation errors prevent submission with detailed messages

---

## Grant Redirect Rules

**Type**: `object`

**Required**: Yes (with fallback)

Controls routing and status transitions based on application state and GAS status. Validated at startup to ensure correct configuration.

**Key files**:

- `src/server/status/status-helper.js`
- `src/server/common/forms/services/form.js` (lines 15-29, 171-224)

### preSubmission

**Type**: `array`
**Required**: Yes (exactly 1 rule)

Defines where to redirect when user has existing application state, but has not submitted yet.
Typically redirects to confirmation or summary page.

**Usage**:

```yaml
metadata:
  grantRedirectRules:
    preSubmission:
      - toPath: /tasks
```

### postSubmission

**Type**: `array`

**Required**: Yes (minimum 1 rule + default fallback)

Rules for routing after submission based on grants-ui status and GAS status combinations.

**Rule structure**:

```yaml
postSubmission:
  - fromGrantsStatus: SUBMITTED,REOPENED # Comma-separated or 'default'
    gasStatus: APPLICATION_WITHDRAWN # GAS status or 'default'
    toGrantsStatus: CLEARED # New status to set
    toPath: /start # Where to redirect
```

**Common status values**:

- **gasStatus**: `APPLICATION_RECEIVED`, `IN_REVIEW`, `AWAITING_AMENDMENTS`, `AGREEMENT_OFFERED`, `AGREEMENT_ACCEPTED`, `APPLICATION_WITHDRAWN`, `default`
- **fromGrantsStatus**: `SUBMITTED`, `REOPENED`, `CLEARED`, `default`
- **toGrantsStatus**: Same as fromGrantsStatus

**Full example**:

```yaml
metadata:
  grantRedirectRules:
    preSubmission:
      - toPath: /tasks
    postSubmission:
      # Received, reviewing and accepted
      - fromGrantsStatus: SUBMITTED
        gasStatus: APPLICATION_RECEIVED,IN_REVIEW,AGREEMENT_GENERATING
        toGrantsStatus: SUBMITTED
        toPath: /confirmation

      # Cleared
      - fromGrantsStatus: SUBMITTED,REOPENED
        gasStatus: APPLICATION_WITHDRAWN
        toGrantsStatus: CLEARED
        toPath: /start

      # Awaiting amendments
      - fromGrantsStatus: SUBMITTED
        gasStatus: AWAITING_AMENDMENTS
        toGrantsStatus: REOPENED
        toPath: /tasks

      # Agreement offered -> agreements service
      - fromGrantsStatus: SUBMITTED
        gasStatus: AGREEMENT_OFFERED,AGREEMENT_ACCEPTED
        toGrantsStatus: SUBMITTED
        toPath: /agreement

      # Default fallback (required)
      - fromGrantsStatus: default
        gasStatus: default
        toGrantsStatus: SUBMITTED
        toPath: /confirmation
```

### excludedPaths

**Type**: `array`
**Required**: No

Paths that bypass redirect rules. Useful for static pages like terms and conditions.

**Usage**:

```yaml
metadata:
  grantRedirectRules:
    excludedPaths: ['terms-and-conditions', 'fptt-information', 'fptt-actions']
```

**How it works**:

- `formsStatusCallback()` runs on every page request
- Checks application state (pre/post submission)
- For post-submission: Queries GAS API for current status
- `mapStatusToUrl()` finds first matching rule
- `persistStatus()` updates status in cache and GAS
- Excluded paths skip all redirect logic

---

## Confirmation Content

**Type**: `object`

**Required**: No

Customises the confirmation page displayed after successful submission.

**Key files**:

- `src/server/confirmation/services/confirmation.service.js`
- `src/server/confirmation/config-confirmation.js`

**Properties**:

| Property     | Type   | Required | Description                                                      |
| ------------ | ------ | -------- | ---------------------------------------------------------------- |
| `panelTitle` | string | No       | Title in green confirmation panel (default: "Details submitted") |
| `panelText`  | string | No       | Text above reference number (default: "Your reference number")   |
| `html`       | string | No       | Custom HTML content below the panel                              |

**Usage**:

```yaml
metadata:
  confirmationContent:
    panelTitle: 'Details submitted'
    panelText: 'Your reference number'
    html: |
      <h2 class="govuk-heading-m">What happens next</h2>
      <p class="govuk-body">Defra will email you when your funding offer is available to review.</p>
      <p class="govuk-body">This will be within 5 working days.</p>

      {{DEFRASUPPORTDETAILS}}
```

**HTML processing**:

- `processConfirmationContent()` processes the HTML
- `ComponentsRegistry.replaceComponents()` swaps tokens like `{{DEFRASUPPORTDETAILS}}` with actual components
- Supports full GOV.UK Design System HTML components
- View model includes reference number, business name, and SBI

**Available tokens**:

- `{{DEFRASUPPORTDETAILS}}`: Standard Defra support contact information

---

## Whitelist Configuration

**Type**: `string` (environment variable names)

**Required**: No

Restricts grant access to specific Customer Reference Numbers (CRNs) and Single Business Identifiers (SBIs). If either is set, both must be configured.

**Key files**:

- `src/server/common/forms/services/form.js` (lines 92-142)
- `src/server/auth/services/whitelist.service.js`
- `src/server/common/helpers/whitelist/whitelist.js`

**Properties**:

| Property             | Type   | Required    | Description                                               |
| -------------------- | ------ | ----------- | --------------------------------------------------------- |
| `whitelistCrnEnvVar` | string | Conditional | Environment variable name containing comma-separated CRNs |
| `whitelistSbiEnvVar` | string | Conditional | Environment variable name containing comma-separated SBIs |

**Usage**:

```yaml
metadata:
  whitelistCrnEnvVar: FARMING_PAYMENTS_WHITELIST_CRNS
  whitelistSbiEnvVar: FARMING_PAYMENTS_WHITELIST_SBIS
```

**Environment configuration**:

```bash
FARMING_PAYMENTS_WHITELIST_CRNS=12345,67890,11111
FARMING_PAYMENTS_WHITELIST_SBIS=105001234,105005678
```

**Validation**:

- **Startup checks**:
  - Both variables must be configured together
  - Environment variables must exist in `process.env`
  - Throws errors if misconfigured
- **Runtime enforcement**:
  - Runs after authentication via `onPostAuth` hook
  - User must pass **both** CRN and SBI checks
  - Redirects to `/auth/journey-unauthorised` if denied
  - Comprehensive logging for all scenarios

**Access control logic**:

- Both CRN and SBI must be in respective whitelists
- If either fails, access is denied
- If no whitelist configured, everyone has access

---

## Details Page Configuration

**Type**: `object`

**Required**: No

Configures a data-driven "check your details" page that queries external APIs (consolidated view) and displays results in GOV.UK Summary List format.

**Key files**:

- `src/server/details-page/check-details.controller.js`
- `src/server/common/services/details-page/graphql-query-builder.js`
- `src/server/common/services/details-page/field-mapping-processor.js`
- `src/server/common/services/details-page/display-field-processor.js`

### query

Defines GraphQL query structure to fetch data from consolidated view API.

**Structure**:

```yaml
detailsPage:
  query:
    name: Business
    entities:
      - name: customer
        variableName: crn
        variableSource: credentials.crn
        fields:
          - path: info
            fields:
              - path: name
                fields:
                  - path: title
                  - path: first
                  - path: middle
                  - path: last
      - name: business
        variableName: sbi
        variableSource: credentials.sbi
        fields:
          - path: info
            fields:
              - path: name
              - path: address
                fields:
                  - path: line1
                  - path: city
                  - path: postalCode
```

**Properties**:

- `name`: Query name
- `entities`: Array of GraphQL entities to query
  - `name`: Entity name in GraphQL schema
  - `variableName`: Parameter name for the query
  - `variableSource`: Where to get value (e.g. `credentials.crn`, `credentials.sbi`)
  - `fields`: Nested field structure with recursive `path` and `fields`

**How it works**:

- `buildGraphQLQuery()` constructs query string from config
- `resolveVariable()` extracts values from `request.auth.credentials`
- Supports nested field selections with automatic indentation
- Validates configuration at query build time

### responseMapping

Maps API response paths to simplified internal structure using dot-notation.

**Structure**:

```yaml
detailsPage:
  responseMapping:
    business: data.business.info
    customer: data.customer.info
    countyParishHoldings: data.business.countyParishHoldings[0].cphNumber
```

**How it works**:

- `mapResponse()` uses dot-notation to extract nested values
- Supports array indexing (e.g. `[0]`)
- Creates flat object from nested API response
- Safe property access with `resolvePath()` utility

### displaySections

Defines how to display mapped data in GOV.UK Summary List format.

**Structure**:

```yaml
detailsPage:
  displaySections:
    - title: Applicant details
      description: Optional description text
      fields:
        - label: Applicant name
          sourcePath: customer.name
          format: fullName
          hideIfEmpty: true
        - label: Organisation name
          sourcePath: business.name
          format: text
    - title: Organisation details
      description: If your application is successful, the following organisation will receive the grant.
      fields:
        - label: Single Business Identifier (SBI) number
          sourceType: credentials
          sourcePath: sbi
        - label: Organisation address
          sourcePath: business.address
          format: address
```

**Field properties**:

| Property      | Type    | Required | Description                                                                  |
| ------------- | ------- | -------- | ---------------------------------------------------------------------------- |
| `label`       | string  | Yes      | Display label for the field                                                  |
| `sourcePath`  | string  | Yes      | Dot-notation path to data in mapped response                                 |
| `format`      | string  | No       | Formatter: `text`, `fullName`, `address`, `contactDetails` (default: `text`) |
| `hideIfEmpty` | boolean | No       | Whether to hide field if value is empty (default: `true`)                    |
| `sourceType`  | string  | No       | Data source: `data` or `credentials` (default: `data`)                       |

**Available formatters**:

- `text`: Simple text display (default)
- `fullName`: Combines title, first, middle, last name (e.g. "Mr John Smith")
- `address`: Formats address with line breaks
- `contactDetails`: Formats contact information

**How it works**:

- `processSections()` iterates through section configs
- `processDisplayFields()` converts fields to GOV.UK Summary List rows
- `resolveFieldValue()` gets data from mapped response or credentials
- `getFormatter()` applies appropriate formatting
- Empty sections (all fields empty) are automatically hidden

**Controller flow**:

1. `CheckDetailsController.get()` handles page request
2. `fetchAndProcessData()` executes GraphQL query
3. `mapResponse()` transforms API response
4. `processSections()` builds Summary List
5. User confirms details with "Are your details correct?"
6. Confirmed data stored in state as `applicant` object

---

## Task List Configuration

**Type**: `object`

**Required**: No

Configures behaviour and appearance of GOV.UK Task List pattern for multi-section forms.

**Key files**:

- `src/server/task-list/task-list.helper.js`
- `src/server/task-list/task-page.controller.js`
- `src/server/task-list/task-list-page.controller.js`

**Properties**:

| Property               | Type    | Required | Default   | Description                                       |
| ---------------------- | ------- | -------- | --------- | ------------------------------------------------- |
| `completeInOrder`      | boolean | No       | `true`    | Whether tasks must be completed sequentially      |
| `returnAfterSection`   | boolean | No       | `true`    | Whether to return to task list after each section |
| `showCompletionStatus` | boolean | No       | `true`    | Whether to show "X of Y tasks completed"          |
| `statuses`             | object  | No       | See below | Custom status tag configuration                   |

### Basic configuration

```yaml
metadata:
  tasklist:
    completeInOrder: true
    returnAfterSection: true
    showCompletionStatus: true
```

**Property details**:

- **completeInOrder**: When `true`, tasks show "Cannot start yet" until previous tasks complete
- **returnAfterSection**: When `true`, returns to task list after each section; when `false`, continues to next page in section
- **showCompletionStatus**: Shows completion summary like "3 of 5 tasks completed"

### Custom status configuration

```yaml
metadata:
  tasklist:
    statuses:
      cannotStart:
        text: 'Cannot start yet'
        classes: 'govuk-tag--grey'
      notStarted:
        text: 'Not started'
        classes: 'govuk-tag--blue'
      completed:
        text: 'Completed'
        classes: 'govuk-tag--green'
```

**Available status keys**:

- `cannotStart`: Task cannot be started (previous tasks incomplete)
- `notStarted`: Task available but not started
- `completed`: Task completed

**Status properties**:

- `text`: Display text for the status tag
- `classes`: GOV.UK tag CSS classes (e.g. `govuk-tag--grey`, `govuk-tag--blue`, `govuk-tag--green`)

### How it works

**Task completion detection**:

- `isTaskCompleted()` checks if all required components have values
- Only question components counted (TextField, RadiosField, etc.)
- Optional components (`required: false`) are ignored
- Compound components like UkAddressField check for subfields

**Task list building**:

- `buildTaskListData()` constructs GOV.UK Task List structure
- Groups pages by `section` property
- Maps sections to titles from `sections` array
- `createTaskItem()` determines status and generates tag
- Completed tasks get clickable links; "Cannot start yet" tasks don't

**Navigation**:

- `getNextTaskPath()` determines next page after submission
- Checks for next page in section with `hasNextPageInSection()`
- Returns to task list when section complete
- `getTaskPageBackLink()` provides "Back to task list" link

**Controllers**:

- `TaskListPageController`: Renders task list page
- `TaskPageController`: Handles individual task pages with section-aware navigation
- Overrides default forms-engine-plugin navigation
- Supports components positioned above/below task list

**Example form structure**:

```yaml
sections:
  - name: example-section-one
    title: Example section one
  - name: example-section-two
    title: Example section two

pages:
  - title: Example Task List
    path: /tasks
    controller: TaskListPageController

  - title: Task one
    path: /task-one
    section: example-section-one
    controller: TaskPageController
    components:
      - name: firstName
        type: TextField
        title: First name
        options:
          required: true

  - title: Task two
    path: /task-two
    section: example-section-two
    controller: TaskPageController
    components:
      - name: email
        type: EmailAddressField
        title: Email address
        options:
          required: true
```

---

## Reference

### Property Summary

| Property                          | Type          | Required | Validates At |
| --------------------------------- | ------------- | -------- | ------------ |
| `id`                              | string (UUID) | Yes      | Startup      |
| `enabledInProd`                   | boolean       | No       | Startup      |
| `referenceNumberPrefix`           | string        | No       | Runtime      |
| `cookieConsent`                   | object        | No       | Runtime      |
| `submission.grantCode`            | string        | Yes      | Startup      |
| `submission.submissionSchemaPath` | string        | Yes      | Startup      |
| `grantRedirectRules`              | object        | Yes      | Startup      |
| `confirmationContent`             | object        | No       | Runtime      |
| `whitelistCrnEnvVar`              | string        | No\*     | Startup      |
| `whitelistSbiEnvVar`              | string        | No\*     | Startup      |
| `detailsPage`                     | object        | No       | Runtime      |
| `tasklist`                        | object        | No       | Runtime      |

\* Both or neither must be configured

### Common file locations

- **Grant definitions**: `src/server/common/forms/definitions/*.yaml`
- **Submission schemas**: `src/server/common/forms/schemas/*.schema.json`
- **Form loader**: `src/server/common/forms/services/form.js`
- **Status helper**: `src/server/status/status-helper.js`
- **Controllers**: `src/server/*/` (various subdirectories)

### Metadata access

In controllers and services:

```javascript
const metadata = request.app.model.def.metadata
const grantCode = metadata.submission?.grantCode
```
