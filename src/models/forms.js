import {
  FormDefinitionError,
  FormDefinitionRequestType,
  checkErrors,
  componentSchema,
  formDefinitionSchema,
  formDefinitionV2Schema,
  formMetadataInputSchema,
  idSchema,
  listSchemaV2,
  pageRepeatSchema,
  pageSchemaV2,
  sectionsSchemaV2,
  slugSchema
} from '@defra/forms-model'
import Joi from 'joi'

// Retrieve form by ID schema
export const formByIdSchema = Joi.object()
  .keys({
    id: idSchema
  })
  .required()

export const pageByIdSchema = Joi.object()
  .keys({
    id: idSchema,
    pageId: Joi.string().uuid().required()
  })
  .required()

export const componentByIdSchema = Joi.object()
  .keys({
    id: idSchema,
    pageId: Joi.string().uuid().required(),
    componentId: Joi.string().uuid().required()
  })
  .required()

export const listByIdSchema = Joi.object()
  .keys({
    id: idSchema,
    listId: Joi.string().uuid().required()
  })
  .required()

export const listSchemaWithRequiredIdSchema = listSchemaV2
  .keys({
    id: Joi.string().uuid().required()
  })
  .required()

export const conditionByIdSchema = Joi.object()
  .keys({
    id: idSchema,
    conditionId: Joi.string().uuid().required()
  })
  .required()

export const optionByNameSchema = Joi.object()
  .keys({
    id: idSchema,
    optionName: Joi.string().valid('showReferenceNumber').required()
    // If we add more options here, probably best to create an enum in forms-model that we can use here
  })
  .required()

export const componentPayloadWithRequiredIdSchema = componentSchema.keys({
  id: Joi.string().uuid().required()
})
export const prependQuerySchema = Joi.object().keys({
  prepend: Joi.boolean().default(false)
})

export const patchPageSchema = Joi.object()
  .keys({
    title: pageSchemaV2.extract('title').optional(),
    path: pageSchemaV2.extract('path').optional(),
    controller: pageSchemaV2.extract('controller').optional().allow(null),
    repeat: pageRepeatSchema.optional().allow(null),
    condition: Joi.string().trim().optional().allow(null) // using simple validation here - pageSchemaV2.extract('condition') requires full form context which isn't available during payload validation
  })
  .required()
  .min(1)

// Retrieve form by slug schema
export const formBySlugSchema = Joi.object()
  .keys({
    slug: slugSchema
  })
  .required()

// Create form schema
export const createFormSchema = Joi.object().keys({
  title: formMetadataInputSchema.extract('title'),
  organisation: formMetadataInputSchema.extract('organisation'),
  teamName: formMetadataInputSchema.extract('teamName'),
  teamEmail: formMetadataInputSchema.extract('teamEmail')
})

export const updateFormDefinitionSchema = Joi.alternatives().try(
  formDefinitionSchema, // V1 forms (schema: 1)
  formDefinitionV2Schema // V2 forms (schema: 2)
)

export const migrateDefinitionParamSchema = Joi.object()
  .keys({
    id: idSchema,
    version: Joi.string().allow('v1', 'v2').required()
  })
  .required()

export const sortIdsSchema = Joi.array().items(Joi.string().uuid().required()).min(1).required()

export const sectionAssignmentItemSchema = sectionsSchemaV2.concat(
  Joi.object({
    name: Joi.string().trim().min(1).optional(),
    title: Joi.string().trim().min(1).required(),
    pageIds: Joi.array().items(Joi.string().uuid()).required()
  })
)

export const sectionAssignmentPayloadSchema = Joi.object()
  .keys({
    sections: Joi.array()
      .items(sectionAssignmentItemSchema)
      .unique('id', { ignoreUndefined: true })
      .unique('name', { ignoreUndefined: true })
      .unique('title')
      .required()
      .error(
        checkErrors([
          FormDefinitionError.UniqueSectionId,
          FormDefinitionError.UniqueSectionName,
          FormDefinitionError.UniqueSectionTitle
        ])
      ),
    requestType: Joi.string()
      .valid(
        FormDefinitionRequestType.CREATE_SECTION,
        FormDefinitionRequestType.DELETE_SECTION,
        FormDefinitionRequestType.ASSIGN_SECTIONS,
        FormDefinitionRequestType.UNASSIGN_SECTIONS
      )
      .required()
  })
  .required()
