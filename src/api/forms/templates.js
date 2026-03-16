import { ControllerPath, ControllerType, Engine, SchemaVersion } from '@defra/forms-model'

/**
 * Function to return an empty form
 */
export function empty() {
  return /** @satisfies {FormDefinition} */ ({
    name: '',
    engine: undefined,
    startPage: ControllerPath.Summary,
    metadata: {},
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
  return /** @satisfies {FormDefinitionWithMetadata} */ ({
    name: '',
    engine: Engine.V2,
    schema: SchemaVersion.V2,
    startPage: ControllerPath.Start,
    metadata: {},
    pages: [],
    conditions: [],
    sections: [],
    lists: []
  })
}

/**
 * @import { FormDefinition } from '@defra/forms-model'
 * @import { FormDefinitionWithMetadata } from '~/src/api/types.js'
 */
