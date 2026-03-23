import Joi from 'joi'

/**
 * @typedef {object} CookieConsent
 * @property {boolean} enabled - Whether cookie consent banner is enabled
 * @property {string} serviceName - Name of the service displayed in cookie banner
 * @property {string} cookiePolicyUrl - Relative URL to cookie policy page
 * @property {number} expiryDays - Number of days before cookie consent expires
 */

/**
 * @typedef {object} Submission
 * @property {string} grantCode - Grant code identifier for submission
 * @property {string} submissionSchemaPath - Path to submission schema file
 */

/**
 * @typedef {object} GrantRedirectRule
 * @property {string} fromGrantsStatus - Source grants status
 * @property {string} gasStatus - Grant Administration Service status
 * @property {string} toGrantsStatus - Target grants status
 * @property {string} toPath - Redirect path
 */

/**
 * @typedef {object} GrantRedirectRules
 * @property {Array<{toPath: string}>} preSubmission - Pre-submission redirect rules
 * @property {GrantRedirectRule[]} postSubmission - Post-submission redirect rules
 * @property {string[]} [excludedPaths] - Paths excluded from redirect rules
 */

/**
 * @typedef {object} ConfirmationContent
 * @property {string} [panelTitle] - Confirmation panel title
 * @property {string} [panelText] - Confirmation panel text
 * @property {string} [html] - Additional HTML content for confirmation page
 */

/**
 * @typedef {object} DetailsPageQueryEntity
 * @property {string} name - Entity name
 * @property {string} variableName - Variable name for entity
 * @property {string} variableSource - Source path for variable
 * @property {Array<{path: string, fields?: any[]}>} [fields] - Fields to query from entity
 */

/**
 * @typedef {object} DetailsPageQuery
 * @property {string} name - Query name
 * @property {DetailsPageQueryEntity[]} entities - Query entities
 */

/**
 * @typedef {object} DetailsPageField
 * @property {string} label - Field label
 * @property {string} sourcePath - Path to data source
 * @property {string} [format] - Display format for field
 * @property {boolean} [hideIfEmpty] - Whether to hide field if empty
 * @property {string} [sourceType] - Type of data source
 */

/**
 * @typedef {object} DetailsPageDisplaySection
 * @property {string} title - Section title
 * @property {string} [description] - Section description
 * @property {DetailsPageField[]} fields - Fields to display in section
 */

/**
 * @typedef {object} DetailsPage
 * @property {DetailsPageQuery} query - Query configuration
 * @property {Record<string, string>} responseMapping - Mapping of response data
 * @property {DetailsPageDisplaySection[]} displaySections - Display sections configuration
 */

/**
 * @typedef {object} TaskListStatus
 * @property {string} text - Status text to display
 * @property {string} classes - CSS classes for status styling
 */

/**
 * @typedef {object} TaskListStatuses
 * @property {TaskListStatus} [cannotStart] - Cannot start status configuration
 * @property {TaskListStatus} [notStarted] - Not started status configuration
 * @property {TaskListStatus} [completed] - Completed status configuration
 */

/**
 * @typedef {object} TaskList
 * @property {boolean} [completeInOrder] - Whether sections must be completed in order
 * @property {boolean} [returnAfterSection] - Whether to return to task list after each section
 * @property {boolean} [showCompletionStatus] - Whether to show completion status
 * @property {TaskListStatuses} [statuses] - Custom status configurations
 */

/**
 * @typedef {object} FormDefinitionMetadata
 * @property {string} [id] - Unique identifier for grant definition
 * @property {boolean} [enabledInProd] - Whether grant is enabled in production
 * @property {string} [referenceNumberPrefix] - Prefix for generated reference numbers
 * @property {CookieConsent} [cookieConsent] - Cookie consent configuration
 * @property {Submission} [submission] - Submission configuration
 * @property {GrantRedirectRules} [grantRedirectRules] - Grant redirect rules configuration
 * @property {ConfirmationContent} [confirmationContent] - Confirmation page content
 * @property {string} [whitelistCrnEnvVar] - Environment variable name for CRN whitelist
 * @property {string} [whitelistSbiEnvVar] - Environment variable name for SBI whitelist
 * @property {DetailsPage} [detailsPage] - Details page configuration
 * @property {TaskList} [tasklist] - Task list configuration
 */

/**
 * Joi schema for cookie consent configuration
 */
const cookieConsentSchema = Joi.object({
  enabled: Joi.boolean().required(),
  serviceName: Joi.string().trim().required(),
  cookiePolicyUrl: Joi.string().trim().uri({ relativeOnly: true }).required(),
  expiryDays: Joi.number().integer().positive().required()
})
  .description('Cookie consent banner configuration')
  .optional()

/**
 * Joi schema for submission configuration
 */
const submissionSchema = Joi.object({
  grantCode: Joi.string().trim().optional(),
  submissionSchemaPath: Joi.string().trim().optional()
})
  .description('Submission configuration for Grant Administration Service')
  .optional()

/**
 * Joi schema for grant redirect rules
 */
const grantRedirectRulesSchema = Joi.object({
  preSubmission: Joi.array()
    .items(
      Joi.object({
        toPath: Joi.string().trim().required()
      })
    )
    .length(1)
    .required()
    .description('Pre-submission redirect rules (exactly 1 required)'),
  postSubmission: Joi.array()
    .items(
      Joi.object({
        fromGrantsStatus: Joi.string().trim().required(),
        gasStatus: Joi.string().trim().required(),
        toGrantsStatus: Joi.string().trim().required(),
        toPath: Joi.string().trim().required()
      })
    )
    .min(1)
    .required()
    .description('Post-submission redirect rules (minimum 1 required with default fallback)'),
  excludedPaths: Joi.array().items(Joi.string().trim()).optional().description('Paths excluded from redirect rules')
})
  .description('Grant redirect rules for status-based routing')
  .allow(null)
  .optional()

/**
 * Joi schema for confirmation content
 */
const confirmationContentSchema = Joi.object({
  panelTitle: Joi.string().trim().allow('').optional(),
  panelText: Joi.string().trim().allow('').optional(),
  html: Joi.string().trim().allow('').optional()
})
  .description('Confirmation page content configuration')
  .optional()

/**
 * Joi schema for details page query configuration
 */
const detailsPageQuerySchema = Joi.object({
  name: Joi.string().trim().required(),
  entities: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().trim().required(),
        variableName: Joi.string().trim().required(),
        variableSource: Joi.string().trim().required(),
        fields: Joi.array()
          .items(
            Joi.object({
              path: Joi.string().trim().required(),
              fields: Joi.array().optional()
            })
          )
          .optional()
      })
    )
    .required()
})

/**
 * Joi schema for details page display sections
 */
const detailsPageDisplaySectionsSchema = Joi.array().items(
  Joi.object({
    title: Joi.string().trim().required(),
    description: Joi.string().trim().allow('').optional(),
    fields: Joi.array()
      .items(
        Joi.object({
          label: Joi.string().trim().required(),
          sourcePath: Joi.string().trim().required(),
          format: Joi.string().trim().valid('text', 'fullName', 'address', 'contactDetails').optional(),
          hideIfEmpty: Joi.boolean().optional(),
          sourceType: Joi.string().trim().valid('data', 'credentials').optional()
        })
      )
      .required()
  })
)

/**
 * Joi schema for details page configuration
 */
const detailsPageSchema = Joi.object({
  query: detailsPageQuerySchema.required(),
  responseMapping: Joi.object().pattern(Joi.string(), Joi.string()).required(),
  displaySections: detailsPageDisplaySectionsSchema.required()
})
  .description('Details page configuration for data-driven check your details pages')
  .optional()

/**
 * Joi schema for task list statuses
 */
const taskListStatusesSchema = Joi.object({
  cannotStart: Joi.object({
    text: Joi.string().trim().required(),
    classes: Joi.string().trim().required()
  }).optional(),
  notStarted: Joi.object({
    text: Joi.string().trim().required(),
    classes: Joi.string().trim().required()
  }).optional(),
  completed: Joi.object({
    text: Joi.string().trim().required(),
    classes: Joi.string().trim().required()
  }).optional()
}).optional()

/**
 * Joi schema for task list configuration
 */
const tasklistSchema = Joi.object({
  completeInOrder: Joi.boolean().optional().default(true),
  returnAfterSection: Joi.boolean().optional().default(true),
  showCompletionStatus: Joi.boolean().optional().default(true),
  statuses: taskListStatusesSchema
})
  .description('Task list configuration for multi-section forms')
  .optional()

/**
 * Complete metadata schema for form definitions
 */
export const formDefinitionMetadataSchema = Joi.object({
  id: Joi.string().uuid().optional().description('Unique identifier for the grant definition'),
  enabledInProd: Joi.boolean().optional().description('Whether this grant is enabled in production'),
  referenceNumberPrefix: Joi.string().trim().optional().description('Prefix for generated reference numbers'),
  cookieConsent: cookieConsentSchema,
  submission: submissionSchema,
  grantRedirectRules: grantRedirectRulesSchema,
  confirmationContent: confirmationContentSchema,
  whitelistCrnEnvVar: Joi.string().trim().optional().description('Environment variable name for CRN whitelist'),
  whitelistSbiEnvVar: Joi.string().trim().optional().description('Environment variable name for SBI whitelist'),
  detailsPage: detailsPageSchema,
  tasklist: tasklistSchema
})
  .unknown(true)
  .optional()
  .description('Metadata configuration for form definition runtime behavior')

/**
 * Validates that whitelist environment variables are configured correctly
 * Both must be present together or both must be absent
 * @param {FormDefinitionMetadata | undefined} metadata - The metadata object to validate
 * @throws {Error} If validation fails
 */
export function validateWhitelistConfig(metadata) {
  if (!metadata) {
    return
  }

  const { whitelistCrnEnvVar, whitelistSbiEnvVar } = metadata

  const hasCrn = !!whitelistCrnEnvVar
  const hasSbi = !!whitelistSbiEnvVar

  // Both must be present or both must be absent
  if (hasCrn !== hasSbi) {
    throw new Error(
      'Whitelist configuration error: Both whitelistCrnEnvVar and whitelistSbiEnvVar must be configured together, or both must be omitted'
    )
  }
}

/**
 * Validates grant redirect rules structure
 * @param {FormDefinitionMetadata | undefined} metadata - The metadata object to validate
 * @throws {Error} If validation fails
 */
export function validateGrantRedirectRules(metadata) {
  if (!metadata?.grantRedirectRules) {
    return
  }

  const { preSubmission, postSubmission } = metadata.grantRedirectRules

  // Validate preSubmission has exactly 1 rule
  if (preSubmission.length !== 1) {
    throw new Error('Grant redirect rules error: preSubmission must have exactly 1 rule')
  }

  // Validate postSubmission has at least 1 rule
  if (!postSubmission || postSubmission.length < 1) {
    throw new Error('Grant redirect rules error: postSubmission must have at least 1 rule')
  }

  // Check if there's a default fallback rule
  const hasDefaultFallback = postSubmission.some(
    (rule) => rule.fromGrantsStatus === 'default' && rule.gasStatus === 'default'
  )

  if (!hasDefaultFallback) {
    throw new Error(
      'Grant redirect rules error: postSubmission must include a default fallback rule (fromGrantsStatus: "default", gasStatus: "default")'
    )
  }
}

/**
 * Validates the complete metadata object
 * @param {FormDefinitionMetadata | undefined} metadata - The metadata object to validate
 * @throws {Error} If validation fails
 */
export function validateMetadata(metadata) {
  if (!metadata) {
    return
  }

  // Validate schema structure
  const { error } = formDefinitionMetadataSchema.validate(metadata, { abortEarly: false })

  if (error) {
    throw new Error(`Metadata validation error: ${error.message}`)
  }

  // Apply business logic validations
  validateWhitelistConfig(metadata)
  validateGrantRedirectRules(metadata)
}

/**
 * Validates metadata for forms being published to live
 * This applies stricter validation rules than draft validation
 * @param {FormDefinitionMetadata | undefined} metadata - The metadata object to validate
 * @throws {Error} If validation fails
 */
export function validateMetadataForPublishing(metadata) {
  // First run standard validation
  validateMetadata(metadata)

  // Additional checks for live publishing can be added here
  // For example, checking that required runtime configurations are present
}
