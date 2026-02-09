import { ControllerType, Engine, SchemaVersion } from '@defra/forms-model'
import { ValidationError } from 'joi'

import { buildDefinition } from '~/src/api/forms/__stubs__/definition.js'
import { sortIdsSchema, updateFormDefinitionSchema } from '~/src/models/forms.js'

describe('forms model', () => {
  describe('sortIdsSchema', () => {
    it('should accept a list of uuids', () => {
      const payload = [
        '49e31f0d-63e4-4da4-9525-1494a7d7edc5',
        '90c9d202-5594-4953-b77f-3a65022186c6',
        '0cc7b818-a64f-4159-ba86-ef01f9e46e32'
      ]

      const { value, error } = sortIdsSchema.validate(payload)
      expect(error).toBeUndefined()
      expect(value).toEqual(payload)
    })

    it('should not accept an invalid list', () => {
      expect(sortIdsSchema.validate([]).error).toEqual(
        new ValidationError('"value" does not contain 1 required value(s)', [], [])
      )
      expect(sortIdsSchema.validate(['not-a-valid-uuid']).error).toEqual(
        new ValidationError('"[0]" must be a valid GUID', [], ['not-a-valid-uuid'])
      )
    })
  })

  describe('updateFormDefinitionSchema', () => {
    describe('V1 form definitions', () => {
      it('should accept valid V1 form definition with schema 1', () => {
        const v1FormDefinition = buildDefinition({
          name: 'Test Form V1',
          schema: 1,
          startPage: '/summary'
        })

        const result = updateFormDefinitionSchema.validate(v1FormDefinition)
        expect(result.error).toBeUndefined()
        expect(result.value.name).toBe('Test Form V1')
        expect(result.value.schema).toBe(1)
        expect(result.value.startPage).toBe('/summary')
      })

      it('should accept valid V1 form definition without schema property', () => {
        const v1FormDefinition = buildDefinition({
          name: 'Test Form V1',
          startPage: '/summary'
        })

        const result = updateFormDefinitionSchema.validate(v1FormDefinition)
        expect(result.error).toBeUndefined()
        expect(result.value.name).toBe('Test Form V1')
        expect(result.value.startPage).toBe('/summary')
      })

      it('should accept valid V1 form definition without engine property', () => {
        const v1FormDefinition = buildDefinition({
          name: 'Test Form V1',
          schema: 1,
          startPage: '/summary'
        })

        const result = updateFormDefinitionSchema.validate(v1FormDefinition)
        expect(result.error).toBeUndefined()
        expect(result.value.name).toBe('Test Form V1')
        expect(result.value.schema).toBe(1)
      })
    })

    describe('V2 form definitions', () => {
      it('should accept valid V2 form definition with schema 2', () => {
        const v2FormDefinition = buildDefinition({
          name: 'Test Form V2',
          schema: 2,
          engine: Engine.V2,
          startPage: '/summary',
          pages: [
            {
              id: '449a45f6-4541-4a46-91bd-8b8931b07b50',
              title: 'Summary',
              path: '/summary',
              controller: ControllerType.Summary
            }
          ]
        })

        const result = updateFormDefinitionSchema.validate(v2FormDefinition)
        expect(result.error).toBeUndefined()
        expect(result.value.name).toBe('Test Form V2')
        expect(result.value.schema).toBe(2)
        expect(result.value.engine).toBe(Engine.V2)
      })

      it('should accept valid V2 form definition with SchemaVersion.V2', () => {
        const v2FormDefinition = buildDefinition({
          name: 'Test Form V2',
          schema: SchemaVersion.V2,
          engine: Engine.V2,
          startPage: '/summary',
          pages: [
            {
              id: '449a45f6-4541-4a46-91bd-8b8931b07b50',
              title: 'Summary',
              path: '/summary',
              controller: ControllerType.Summary
            }
          ]
        })

        const result = updateFormDefinitionSchema.validate(v2FormDefinition)
        expect(result.error).toBeUndefined()
        expect(result.value.name).toBe('Test Form V2')
        expect(result.value.schema).toBe(SchemaVersion.V2)
        expect(result.value.engine).toBe(Engine.V2)
      })

      it('should accept V2 form definition with engine V2 but no schema property', () => {
        const v2FormDefinition = buildDefinition({
          name: 'Test Form V2',
          engine: Engine.V2,
          startPage: '/summary',
          pages: [
            {
              id: '449a45f6-4541-4a46-91bd-8b8931b07b50',
              title: 'Summary',
              path: '/summary',
              controller: ControllerType.Summary
            }
          ]
        })

        const result = updateFormDefinitionSchema.validate(v2FormDefinition)
        expect(result.error).toBeUndefined()
        expect(result.value.name).toBe('Test Form V2')
        expect(result.value.engine).toBe(Engine.V2)
        // Schema may be set to default value
      })
    })

    describe('Mixed and edge cases', () => {
      it('should reject form definition with invalid schema version', () => {
        /** @type {any} */
        const invalidFormDefinition = {
          ...buildDefinition({
            name: 'Test Form',
            startPage: '/summary'
          }),
          schema: 999 // Invalid schema version
        }

        const result = updateFormDefinitionSchema.validate(invalidFormDefinition)
        expect(result.error).toBeDefined()
        expect(result.error?.message).toContain('does not match any of the allowed types')
      })

      it('should reject form definition with invalid properties', () => {
        const invalidFormDefinition = {
          ...buildDefinition({
            name: 'Test Form',
            schema: 1,
            startPage: '/summary'
          }),
          invalidProperty: 'should not be allowed'
        }

        const result = updateFormDefinitionSchema.validate(invalidFormDefinition)
        expect(result.error).toBeDefined()
      })

      it('should reject form definition with missing required fields', () => {
        const invalidFormDefinition = {
          // Missing required fields
        }

        const result = updateFormDefinitionSchema.validate(invalidFormDefinition)
        expect(result.error).toBeDefined()
      })
    })

    describe('Joi.alternatives() behavior', () => {
      it('should try V1 schema first and fall back to V2 schema', () => {
        // This test verifies that the alternatives schema works as expected
        const v1Form = buildDefinition({
          name: 'V1 Form',
          schema: 1,
          startPage: '/summary'
        })

        const v2Form = buildDefinition({
          name: 'V2 Form',
          schema: 2,
          engine: Engine.V2,
          startPage: '/summary',
          pages: [
            {
              id: '449a45f6-4541-4a46-91bd-8b8931b07b50',
              title: 'Summary',
              path: '/summary',
              controller: ControllerType.Summary
            }
          ]
        })

        const v1Result = updateFormDefinitionSchema.validate(v1Form)
        const v2Result = updateFormDefinitionSchema.validate(v2Form)

        expect(v1Result.error).toBeUndefined()
        expect(v2Result.error).toBeUndefined()
        expect(v1Result.value.name).toBe('V1 Form')
        expect(v2Result.value.name).toBe('V2 Form')
        expect(v1Result.value.schema).toBe(1)
        expect(v2Result.value.schema).toBe(2)
      })
    })
  })
})
