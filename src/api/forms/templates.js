import { ControllerPath, ControllerType, Engine, SchemaVersion } from '@defra/forms-model'

/**
 * Function to return an empty form
 */
export function empty() {
  return /** @satisfies {FormDefinition} */ ({
    name: '',
    engine: undefined,
    startPage: ControllerPath.Summary,
    pages: [
      {
        title: 'Summary',
        path: ControllerPath.Summary,
        controller: ControllerType.Summary
      }
    ],
    conditions: [],
    sections: [
      {
        name: 'section',
        title: 'Section title'
      }
    ],
    lists: []
  })
}

/**
 * Function to return an empty V2 form
 */
export function emptyV2() {
  return /** @satisfies {FormDefinition} */ ({
    name: '',
    engine: Engine.V2,
    schema: SchemaVersion.V2,
    startPage: ControllerPath.Summary,
    pages: [
      {
        id: '449a45f6-4541-4a46-91bd-8b8931b07b50',
        title: '',
        path: ControllerPath.Summary,
        controller: ControllerType.SummaryWithConfirmationEmail
      }
    ],
    conditions: [],
    sections: [],
    lists: []
  })
}

/**
 * @import { FormDefinition } from '@defra/forms-model'
 */
