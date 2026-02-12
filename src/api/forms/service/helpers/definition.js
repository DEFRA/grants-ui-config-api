import { SchemaVersion, formDefinitionSchema, formDefinitionV2Schema } from '@defra/forms-model'

import { InvalidFormDefinitionError } from '~/src/api/forms/errors.js'
import { logger } from '~/src/api/forms/service/shared.js'

/**
 * Determines the correct validation schema based on the form definition's schema property
 * @param {FormDefinition} definition
 * @returns {ObjectSchema<FormDefinition>}
 */
export function getValidationSchema(definition) {
  const { schema } = definition

  // If schema is explicitly V2, use V2 validation
  if (schema === SchemaVersion.V2) {
    return formDefinitionV2Schema
  }

  // Default to V1 validation (for schema V1 or undefined)
  return formDefinitionSchema
}

/**
 * Validates the form definition
 * @param {FormDefinition} definition
 * @param {ObjectSchema<FormDefinition>} schema
 */
export function validate(definition, schema) {
  /** @type {{ error?: ValidationError; value: FormDefinition }} */
  const result = schema.validate(definition, {
    abortEarly: false
  })

  const { error, value } = result

  if (error) {
    const name = !definition.name || definition.name === '' ? 'No name' : definition.name

    logger.warn(`Form failed validation: '${error.message}'. Form name: '${name}'`)

    throw new InvalidFormDefinitionError(error)
  }

  return value
}

/**
 * @import { FormDefinition } from '@defra/forms-model'
 * @import { ObjectSchema, ValidationError } from 'joi'
 */
