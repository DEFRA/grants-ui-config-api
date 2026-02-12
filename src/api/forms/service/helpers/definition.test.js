import { SchemaVersion, formDefinitionSchema, formDefinitionV2Schema } from '@defra/forms-model'
import Joi from 'joi'

import { buildDefinition } from '~/src/api/forms/__stubs__/definition.js'
import { InvalidFormDefinitionError } from '~/src/api/forms/errors.js'
import { getValidationSchema, validate } from '~/src/api/forms/service/helpers/definition.js'

describe('definition helpers', () => {
  describe('getValidationSchema', () => {
    it('should return V1 schema when schema is V1', () => {
      const definition = buildDefinition({ schema: SchemaVersion.V1 })
      const result = getValidationSchema(definition)
      expect(result).toBe(formDefinitionSchema)
    })

    it('should return V2 schema when schema is V2', () => {
      const definition = buildDefinition({ schema: SchemaVersion.V2 })
      const result = getValidationSchema(definition)
      expect(result).toBe(formDefinitionV2Schema)
    })

    it('should return V1 schema by default when no schema specified', () => {
      const definition = buildDefinition({})
      const result = getValidationSchema(definition)
      expect(result).toBe(formDefinitionSchema)
    })

    it('should return V1 schema when schema is undefined', () => {
      const definition = buildDefinition({ schema: undefined })
      const result = getValidationSchema(definition)
      expect(result).toBe(formDefinitionSchema)
    })
  })

  describe('validate', () => {
    const mockSchema = {
      validate: jest.fn()
    }

    beforeEach(() => {
      jest.clearAllMocks()
    })

    it('should return validated value when validation succeeds', () => {
      /** @type {any} */
      const definition = { name: 'Test Form' }
      const expectedValue = { name: 'Test Form', validated: true }

      mockSchema.validate.mockReturnValue({
        error: undefined,
        value: expectedValue
      })

      const result = validate(definition, /** @type {any} */ (mockSchema))

      expect(mockSchema.validate).toHaveBeenCalledWith(definition, {
        abortEarly: false
      })
      expect(result).toBe(expectedValue)
    })

    it('should throw InvalidFormDefinitionError when validation fails', () => {
      /** @type {any} */
      const definition = { name: 'Test Form' }
      const validationError = new Joi.ValidationError('Validation failed', [], {})

      mockSchema.validate.mockReturnValue({
        error: validationError,
        value: undefined
      })

      expect(() => validate(definition, /** @type {any} */ (mockSchema))).toThrow(InvalidFormDefinitionError)
      expect(mockSchema.validate).toHaveBeenCalledWith(definition, {
        abortEarly: false
      })
    })
  })
})
