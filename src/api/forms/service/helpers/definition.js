import { SchemaVersion, formDefinitionSchema, formDefinitionV2Schema } from '@defra/forms-model'

import { InvalidFormDefinitionError } from '~/src/api/forms/errors.js'
import { validateMetadata } from '~/src/api/forms/service/metadata-validation.js'
import { logger } from '~/src/api/forms/service/shared.js'

/**
 * Determines the correct validation schema based on the form definition's schema property
 * @param {FormDefinitionWithMetadata} definition
 * @returns {ObjectSchema<FormDefinition>}
 */
export function getValidationSchema(definition) {
  const { schema } = definition

  // If the schema is explicitly V2, use V2 validation
  if (schema === SchemaVersion.V2) {
    return formDefinitionV2Schema
  }

  // Default to V1 validation (for schema V1 or undefined)
  return formDefinitionSchema
}

/**
 * Validates the form definition
 * @param {FormDefinitionWithMetadata} definition
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

  // Validate metadata
  try {
    validateMetadata(definition.metadata)
  } catch (metadataError) {
    const name = !definition.name || definition.name === '' ? 'No name' : definition.name
    const errorMessage = metadataError instanceof Error ? metadataError.message : String(metadataError)
    logger.warn(`Form metadata failed validation: '${errorMessage}'. Form name: '${name}'`)

    // Convert metadata error to Joi ValidationError for consistent error handling
    const joiError = /** @type {import('joi').ValidationError} */ ({
      message: errorMessage,
      name: 'ValidationError',
      isJoi: true,
      details: [
        {
          message: errorMessage,
          path: ['metadata'],
          type: 'metadata.invalid',
          context: {
            key: 'metadata',
            label: 'metadata',
            value: definition.metadata
          }
        }
      ],
      annotate: () => errorMessage,
      _original: definition.metadata
    })

    throw new InvalidFormDefinitionError(joiError)
  }

  return value
}

/**
 * @import { FormDefinition } from '@defra/forms-model'
 * @import { ObjectSchema, ValidationError } from 'joi'
 * @import { FormDefinitionWithMetadata } from '~/src/api/types.js'
 */
