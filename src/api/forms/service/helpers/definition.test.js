import { SchemaVersion, formDefinitionSchema, formDefinitionV2Schema } from '@defra/forms-model'
import Joi from 'joi'

import { buildDefinition } from '~/src/api/forms/__stubs__/definition.js'
import { InvalidFormDefinitionError } from '~/src/api/forms/errors.js'
import { getValidationSchema, validate } from '~/src/api/forms/service/helpers/definition.js'
import * as metadataValidation from '~/src/api/forms/service/metadata-validation.js'

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
      jest.spyOn(metadataValidation, 'validateMetadata').mockReturnValue(undefined)
    })

    afterEach(() => {
      jest.restoreAllMocks()
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

    describe('metadata validation', () => {
      it('should validate metadata when present in definition', () => {
        /** @type {any} */
        const definition = {
          name: 'Test Form',
          metadata: { id: '123e4567-e89b-12d3-a456-426614174000' }
        }
        const expectedValue = { ...definition, validated: true }

        mockSchema.validate.mockReturnValue({
          error: undefined,
          value: expectedValue
        })

        const result = validate(definition, /** @type {any} */ (mockSchema))

        expect(metadataValidation.validateMetadata).toHaveBeenCalledWith(definition.metadata)
        expect(result).toBe(expectedValue)
      })

      it('should not validate metadata when not present in definition', () => {
        /** @type {any} */
        const definition = { name: 'Test Form' }
        const expectedValue = { name: 'Test Form', validated: true }

        mockSchema.validate.mockReturnValue({
          error: undefined,
          value: expectedValue
        })

        const result = validate(definition, /** @type {any} */ (mockSchema))

        expect(metadataValidation.validateMetadata).not.toHaveBeenCalled()
        expect(result).toBe(expectedValue)
      })

      it('should throw InvalidFormDefinitionError when metadata validation fails', () => {
        /** @type {any} */
        const definition = {
          name: 'Test Form',
          metadata: { invalid: 'data' }
        }

        mockSchema.validate.mockReturnValue({
          error: undefined,
          value: definition
        })

        jest.spyOn(metadataValidation, 'validateMetadata').mockImplementation(() => {
          throw new Error('Invalid metadata structure')
        })

        expect(() => validate(definition, /** @type {any} */ (mockSchema))).toThrow(InvalidFormDefinitionError)
        expect(metadataValidation.validateMetadata).toHaveBeenCalledWith(definition.metadata)
      })

      it('should convert metadata error to Joi ValidationError format', () => {
        /** @type {any} */
        const definition = {
          name: 'Test Form',
          metadata: { invalid: 'data' }
        }

        mockSchema.validate.mockReturnValue({
          error: undefined,
          value: definition
        })

        const metadataError = new Error('Invalid metadata structure')
        jest.spyOn(metadataValidation, 'validateMetadata').mockImplementation(() => {
          throw metadataError
        })

        let thrownError

        try {
          validate(definition, /** @type {any} */ (mockSchema))
        } catch (/** @type {any} */ error) {
          thrownError = error
        }

        expect(thrownError).toBeInstanceOf(InvalidFormDefinitionError)
        expect(thrownError.message).toBe('Invalid metadata structure')
        // Verify error cause contains the validation errors
        expect(thrownError.cause).toBeDefined()
      })

      it('should handle non-Error metadata validation failures', () => {
        /** @type {any} */
        const definition = {
          name: 'Test Form',
          metadata: { invalid: 'data' }
        }

        mockSchema.validate.mockReturnValue({
          error: undefined,
          value: definition
        })

        jest.spyOn(metadataValidation, 'validateMetadata').mockImplementation(() => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw 'String error message'
        })

        let thrownError

        try {
          validate(definition, /** @type {any} */ (mockSchema))
        } catch (/** @type {any} */ error) {
          thrownError = error
        }

        expect(thrownError).toBeInstanceOf(InvalidFormDefinitionError)
        expect(thrownError.message).toBe('String error message')
        expect(thrownError.cause).toBeDefined()
      })

      it('should use "No name" in log when definition has empty name during metadata validation failure', () => {
        /** @type {any} */
        const definition = {
          name: '',
          metadata: { invalid: 'data' }
        }

        mockSchema.validate.mockReturnValue({
          error: undefined,
          value: definition
        })

        jest.spyOn(metadataValidation, 'validateMetadata').mockImplementation(() => {
          throw new Error('Invalid metadata')
        })

        expect(() => validate(definition, /** @type {any} */ (mockSchema))).toThrow(InvalidFormDefinitionError)
      })

      it('should use "No name" in log when definition has no name during metadata validation failure', () => {
        /** @type {any} */
        const definition = {
          metadata: { invalid: 'data' }
        }

        mockSchema.validate.mockReturnValue({
          error: undefined,
          value: definition
        })

        jest.spyOn(metadataValidation, 'validateMetadata').mockImplementation(() => {
          throw new Error('Invalid metadata')
        })

        expect(() => validate(definition, /** @type {any} */ (mockSchema))).toThrow(InvalidFormDefinitionError)
      })
    })
  })
})
