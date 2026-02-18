import {
  formDefinitionMetadataSchema,
  validateGrantRedirectRules,
  validateMetadata,
  validateMetadataForPublishing,
  validateWhitelistConfig
} from '~/src/api/forms/service/metadata-validation.js'

describe('metadata-validation', () => {
  describe('formDefinitionMetadataSchema', () => {
    it('should validate a complete valid metadata object', () => {
      const metadata = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        enabledInProd: true,
        referenceNumberPrefix: 'EGWT',
        cookieConsent: {
          enabled: true,
          serviceName: 'Farm and land service',
          cookiePolicyUrl: '/cookies',
          expiryDays: 365
        },
        submission: {
          grantCode: 'example-grant',
          submissionSchemaPath: './schemas/example.schema.json'
        },
        grantRedirectRules: {
          preSubmission: [{ toPath: '/tasks' }],
          postSubmission: [
            {
              fromGrantsStatus: 'SUBMITTED',
              gasStatus: 'APPLICATION_RECEIVED',
              toGrantsStatus: 'SUBMITTED',
              toPath: '/confirmation'
            },
            {
              fromGrantsStatus: 'default',
              gasStatus: 'default',
              toGrantsStatus: 'SUBMITTED',
              toPath: '/confirmation'
            }
          ],
          excludedPaths: ['terms-and-conditions']
        },
        confirmationContent: {
          panelTitle: 'Details submitted',
          panelText: 'Your reference number',
          html: '<h2>What happens next</h2>'
        },
        tasklist: {
          completeInOrder: true,
          returnAfterSection: true,
          showCompletionStatus: true,
          statuses: {
            cannotStart: {
              text: 'Cannot start yet',
              classes: 'govuk-tag--grey'
            },
            notStarted: {
              text: 'Not started',
              classes: 'govuk-tag--blue'
            },
            completed: {
              text: 'Completed',
              classes: 'govuk-tag--green'
            }
          }
        }
      }

      const { error } = formDefinitionMetadataSchema.validate(metadata)
      expect(error).toBeUndefined()
    })

    it('should validate metadata with only required fields', () => {
      const metadata = {
        id: '550e8400-e29b-41d4-a716-446655440000'
      }

      const { error } = formDefinitionMetadataSchema.validate(metadata)
      expect(error).toBeUndefined()
    })

    it('should validate empty metadata object', () => {
      const metadata = {}

      const { error } = formDefinitionMetadataSchema.validate(metadata)
      expect(error).toBeUndefined()
    })

    it('should reject invalid UUID for id', () => {
      const metadata = {
        id: 'not-a-uuid'
      }

      const { error } = formDefinitionMetadataSchema.validate(metadata)
      expect(error).toBeDefined()
      expect(error?.message).toContain('must be a valid GUID')
    })

    it('should reject invalid cookieConsent structure', () => {
      const metadata = {
        cookieConsent: {
          enabled: true
          // Missing required fields
        }
      }

      const { error } = formDefinitionMetadataSchema.validate(metadata)
      expect(error).toBeDefined()
    })

    it('should reject invalid submission structure', () => {
      const metadata = {
        submission: {
          grantCode: 'test'
          // Missing submissionSchemaPath
        }
      }

      const { error } = formDefinitionMetadataSchema.validate(metadata)
      expect(error).toBeDefined()
    })

    it('should allow unknown properties in metadata', () => {
      const metadata = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        customProperty: 'custom value',
        anotherUnknown: { nested: 'object' }
      }

      const { error } = formDefinitionMetadataSchema.validate(metadata)
      expect(error).toBeUndefined()
    })
  })

  describe('validateWhitelistConfig', () => {
    it('should pass when both whitelist variables are present', () => {
      const metadata = {
        whitelistCrnEnvVar: 'FARMING_PAYMENTS_WHITELIST_CRNS',
        whitelistSbiEnvVar: 'FARMING_PAYMENTS_WHITELIST_SBIS'
      }

      expect(() => {
        validateWhitelistConfig(metadata)
      }).not.toThrow()
    })

    it('should pass when both whitelist variables are absent', () => {
      const metadata = {
        id: '550e8400-e29b-41d4-a716-446655440000'
      }

      expect(() => {
        validateWhitelistConfig(metadata)
      }).not.toThrow()
    })

    it('should pass when metadata is undefined', () => {
      expect(() => {
        validateWhitelistConfig(undefined)
      }).not.toThrow()
    })

    it('should throw when only CRN whitelist variable is present', () => {
      const metadata = {
        whitelistCrnEnvVar: 'FARMING_PAYMENTS_WHITELIST_CRNS'
      }

      expect(() => {
        validateWhitelistConfig(metadata)
      }).toThrow('Both whitelistCrnEnvVar and whitelistSbiEnvVar must be configured together')
    })

    it('should throw when only SBI whitelist variable is present', () => {
      const metadata = {
        whitelistSbiEnvVar: 'FARMING_PAYMENTS_WHITELIST_SBIS'
      }

      expect(() => {
        validateWhitelistConfig(metadata)
      }).toThrow('Both whitelistCrnEnvVar and whitelistSbiEnvVar must be configured together')
    })
  })

  describe('validateGrantRedirectRules', () => {
    it('should pass with valid redirect rules', () => {
      const metadata = {
        grantRedirectRules: {
          preSubmission: [{ toPath: '/tasks' }],
          postSubmission: [
            {
              fromGrantsStatus: 'SUBMITTED',
              gasStatus: 'APPLICATION_RECEIVED',
              toGrantsStatus: 'SUBMITTED',
              toPath: '/confirmation'
            },
            {
              fromGrantsStatus: 'default',
              gasStatus: 'default',
              toGrantsStatus: 'SUBMITTED',
              toPath: '/confirmation'
            }
          ]
        }
      }

      expect(() => {
        validateGrantRedirectRules(metadata)
      }).not.toThrow()
    })

    it('should pass when redirect rules are absent', () => {
      const metadata = {}

      expect(() => {
        validateGrantRedirectRules(metadata)
      }).not.toThrow()
    })

    it('should throw when preSubmission has no rules', () => {
      const metadata = {
        grantRedirectRules: {
          preSubmission: [],
          postSubmission: [
            {
              fromGrantsStatus: 'default',
              gasStatus: 'default',
              toGrantsStatus: 'SUBMITTED',
              toPath: '/confirmation'
            }
          ]
        }
      }

      expect(() => {
        validateGrantRedirectRules(metadata)
      }).toThrow('preSubmission must have exactly 1 rule')
    })

    it('should throw when preSubmission has more than 1 rule', () => {
      const metadata = {
        grantRedirectRules: {
          preSubmission: [{ toPath: '/tasks' }, { toPath: '/summary' }],
          postSubmission: [
            {
              fromGrantsStatus: 'default',
              gasStatus: 'default',
              toGrantsStatus: 'SUBMITTED',
              toPath: '/confirmation'
            }
          ]
        }
      }

      expect(() => {
        validateGrantRedirectRules(metadata)
      }).toThrow('preSubmission must have exactly 1 rule')
    })

    it('should throw when postSubmission has no rules', () => {
      const metadata = {
        grantRedirectRules: {
          preSubmission: [{ toPath: '/tasks' }],
          postSubmission: []
        }
      }

      expect(() => {
        validateGrantRedirectRules(metadata)
      }).toThrow('postSubmission must have at least 1 rule')
    })

    it('should throw when postSubmission has no default fallback', () => {
      const metadata = {
        grantRedirectRules: {
          preSubmission: [{ toPath: '/tasks' }],
          postSubmission: [
            {
              fromGrantsStatus: 'SUBMITTED',
              gasStatus: 'APPLICATION_RECEIVED',
              toGrantsStatus: 'SUBMITTED',
              toPath: '/confirmation'
            }
          ]
        }
      }

      expect(() => {
        validateGrantRedirectRules(metadata)
      }).toThrow('postSubmission must include a default fallback rule')
    })
  })

  describe('validateMetadata', () => {
    it('should pass with valid complete metadata', () => {
      const metadata = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        enabledInProd: true,
        referenceNumberPrefix: 'TEST',
        cookieConsent: {
          enabled: true,
          serviceName: 'Test service',
          cookiePolicyUrl: '/cookies',
          expiryDays: 365
        },
        submission: {
          grantCode: 'test-grant',
          submissionSchemaPath: './schemas/test.schema.json'
        },
        grantRedirectRules: {
          preSubmission: [{ toPath: '/tasks' }],
          postSubmission: [
            {
              fromGrantsStatus: 'default',
              gasStatus: 'default',
              toGrantsStatus: 'SUBMITTED',
              toPath: '/confirmation'
            }
          ]
        },
        whitelistCrnEnvVar: 'TEST_CRNS',
        whitelistSbiEnvVar: 'TEST_SBIS'
      }

      expect(() => {
        validateMetadata(metadata)
      }).not.toThrow()
    })

    it('should pass with undefined metadata', () => {
      expect(() => {
        validateMetadata(undefined)
      }).not.toThrow()
    })

    it('should throw when schema validation fails', () => {
      /** @type {any} */
      const metadata = {
        cookieConsent: {
          enabled: true
          // Missing required fields
        }
      }

      expect(() => {
        validateMetadata(metadata)
      }).toThrow('Metadata validation error')
    })

    it('should throw when whitelist config is invalid', () => {
      const metadata = {
        whitelistCrnEnvVar: 'TEST_CRNS'
        // Missing whitelistSbiEnvVar
      }

      expect(() => {
        validateMetadata(metadata)
      }).toThrow('Both whitelistCrnEnvVar and whitelistSbiEnvVar must be configured together')
    })

    it('should throw when grant redirect rules are invalid', () => {
      const metadata = {
        grantRedirectRules: {
          preSubmission: [{ toPath: '/tasks' }],
          postSubmission: []
        }
      }

      expect(() => {
        validateMetadata(metadata)
      }).toThrow('Metadata validation error')
    })
  })

  describe('validateMetadataForPublishing', () => {
    it('should pass with valid metadata', () => {
      const metadata = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        submission: {
          grantCode: 'test-grant',
          submissionSchemaPath: './schemas/test.schema.json'
        }
      }

      expect(() => {
        validateMetadataForPublishing(metadata)
      }).not.toThrow()
    })

    it('should throw when metadata is invalid', () => {
      const metadata = {
        whitelistCrnEnvVar: 'TEST_CRNS'
        // Missing whitelistSbiEnvVar
      }

      expect(() => {
        validateMetadataForPublishing(metadata)
      }).toThrow()
    })
  })

  describe('detailsPage configuration', () => {
    it('should validate complete detailsPage configuration', () => {
      const metadata = {
        detailsPage: {
          query: {
            name: 'Business',
            entities: [
              {
                name: 'customer',
                variableName: 'crn',
                variableSource: 'credentials.crn',
                fields: [
                  {
                    path: 'info',
                    fields: [
                      {
                        path: 'name'
                      }
                    ]
                  }
                ]
              }
            ]
          },
          responseMapping: {
            business: 'data.business.info',
            customer: 'data.customer.info'
          },
          displaySections: [
            {
              title: 'Applicant details',
              description: 'Check your details',
              fields: [
                {
                  label: 'Applicant name',
                  sourcePath: 'customer.name',
                  format: 'fullName',
                  hideIfEmpty: true
                }
              ]
            }
          ]
        }
      }

      const { error } = formDefinitionMetadataSchema.validate(metadata)
      expect(error).toBeUndefined()
    })
  })

  describe('tasklist configuration', () => {
    it('should validate complete tasklist configuration', () => {
      const metadata = {
        tasklist: {
          completeInOrder: true,
          returnAfterSection: false,
          showCompletionStatus: true,
          statuses: {
            cannotStart: {
              text: 'Cannot start yet',
              classes: 'govuk-tag--grey'
            },
            notStarted: {
              text: 'Not started',
              classes: 'govuk-tag--blue'
            },
            completed: {
              text: 'Completed',
              classes: 'govuk-tag--green'
            }
          }
        }
      }

      const { error } = formDefinitionMetadataSchema.validate(metadata)
      expect(error).toBeUndefined()
    })

    it('should apply defaults for tasklist configuration', () => {
      const metadata = {
        tasklist: {}
      }

      const { error, value } = formDefinitionMetadataSchema.validate(metadata)
      expect(error).toBeUndefined()
      expect(value.tasklist.completeInOrder).toBe(true)
      expect(value.tasklist.returnAfterSection).toBe(true)
      expect(value.tasklist.showCompletionStatus).toBe(true)
    })
  })
})
