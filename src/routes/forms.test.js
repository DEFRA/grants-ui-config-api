import {
  ControllerType,
  Engine,
  FormStatus,
  SchemaVersion,
  Scopes,
  organisations
} from '@defra/forms-model'
import Boom from '@hapi/boom'

import {
  buildDefinition,
  buildSummaryPage
} from '~/src/api/forms/__stubs__/definition.js'
import { FormAlreadyExistsError } from '~/src/api/forms/errors.js'
import {
  createDraftFromLive,
  createLiveFromDraft,
  deleteDraftFormDefinition,
  getFormDefinition,
  listForms,
  updateDraftFormDefinition
} from '~/src/api/forms/service/definition.js'
import {
  createForm,
  getForm,
  getFormBySlug,
  removeForm,
  updateFormMetadata
} from '~/src/api/forms/service/index.js'
import { migrateDefinitionToV2 } from '~/src/api/forms/service/migration.js'
import {
  getFormVersion,
  getFormVersions
} from '~/src/api/forms/service/versioning.js'
import { createServer } from '~/src/api/server.js'
import { auth } from '~/test/fixtures/auth.js'

jest.mock('~/src/mongo.js')
jest.mock('~/src/api/forms/service/index.js')
jest.mock('~/src/api/forms/service/definition.js')
jest.mock('~/src/api/forms/service/page.js')
jest.mock('~/src/api/forms/service/component.js')
jest.mock('~/src/api/forms/service/migration.js')
jest.mock('~/src/api/forms/service/conditions.js')
jest.mock('~/src/api/forms/service/versioning.js')

describe('Forms route', () => {
  /** @type {Server} */
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(() => {
    return server.stop()
  })

  const okStatusCode = 200
  const badRequestStatusCode = 400
  const notFoundStatusCode = 404
  const internalErrorStatusCode = 500
  const jsonContentType = 'application/json'
  const id = '661e4ca5039739ef2902b214'
  const now = new Date()
  const authorId = '86758ba9-92e7-4287-9751-7705e449688e'
  const authorDisplayName = 'Enrique Chase'

  /**
   * @satisfies {FormMetadataAuthor}
   */
  const author = { id: authorId, displayName: authorDisplayName }

  /**
   * @satisfies {FormMetadataInput}
   */
  const stubFormMetadataInput = {
    title: 'Test form',
    organisation: 'Defra',
    teamName: 'Defra Forms',
    teamEmail: 'defraforms@defra.gov.uk'
  }

  /**
   * @satisfies {FormMetadata}
   */
  const stubFormMetadataOutput = {
    id,
    slug: 'test-form',
    title: 'Test form',
    organisation: 'Defra',
    teamName: 'Defra Forms',
    teamEmail: 'defraforms@defra.gov.uk',
    draft: {
      createdAt: now,
      createdBy: author,
      updatedAt: now,
      updatedBy: author
    },
    createdAt: now,
    createdBy: author,
    updatedAt: now,
    updatedBy: author
  }

  /**
   * @satisfies {FormDefinition}
   */
  const stubFormDefinition = buildDefinition({
    name: '',
    pages: [],
    conditions: [],
    sections: [],
    lists: []
  })

  const slug = stubFormMetadataOutput.slug

  /**
   * @satisfies {FilterOptions}
   */
  const mockFilters = {
    authors: ['Joe Bloggs', 'Jane Doe', 'Enrique Chase'],
    organisations: ['Defra', 'Natural England'],
    status: [FormStatus.Live, FormStatus.Draft]
  }

  describe('Success responses', () => {
    test('GET /forms returns empty data array with default pagination, sorting, and search when no parameters are used', async () => {
      jest.mocked(listForms).mockResolvedValue({
        forms: [],
        totalItems: 0,
        filters: mockFilters
      })

      const response = await server.inject({
        method: 'GET',
        url: '/forms',
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({
        data: [],
        meta: {
          pagination: {
            page: 1,
            perPage: 24,
            totalItems: 0,
            totalPages: 0
          },
          sorting: {
            sortBy: 'updatedAt',
            order: 'desc'
          },
          search: {
            title: '',
            author: '',
            organisations: [],
            status: []
          },
          filters: mockFilters
        }
      })
    })

    test('GET /forms with search parameter returns filtered data and correct meta', async () => {
      jest.mocked(listForms).mockResolvedValue({
        forms: [stubFormMetadataOutput],
        totalItems: 1,
        filters: mockFilters
      })

      const response = await server.inject({
        method: 'GET',
        url: '/forms?title=test',
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({
        data: [stubFormMetadataOutput],
        meta: {
          pagination: {
            page: 1,
            perPage: 24,
            totalItems: 1,
            totalPages: 1
          },
          sorting: {
            sortBy: 'updatedAt',
            order: 'desc'
          },
          search: {
            title: 'test',
            author: '',
            organisations: [],
            status: []
          },
          filters: mockFilters
        }
      })
    })

    test('GET /forms with search, pagination and sorting parameters returns filtered, sorted paginated data', async () => {
      jest.mocked(listForms).mockResolvedValue({
        forms: [stubFormMetadataOutput],
        totalItems: 1,
        filters: mockFilters
      })

      const response = await server.inject({
        method: 'GET',
        url: '/forms?page=1&perPage=5&sortBy=title&order=asc&title=test',
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({
        data: [stubFormMetadataOutput],
        meta: {
          pagination: {
            page: 1,
            perPage: 5,
            totalItems: 1,
            totalPages: 1
          },
          sorting: {
            sortBy: 'title',
            order: 'asc'
          },
          search: {
            title: 'test',
            author: '',
            organisations: [],
            status: []
          },
          filters: mockFilters
        }
      })
    })

    test('GET /forms with sorting parameters returns sorted data and correct meta', async () => {
      jest.mocked(listForms).mockResolvedValue({
        forms: [stubFormMetadataOutput],
        totalItems: 1,
        filters: mockFilters
      })

      const response = await server.inject({
        method: 'GET',
        url: '/forms?sortBy=title&order=asc',
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({
        data: [stubFormMetadataOutput],
        meta: {
          pagination: {
            page: 1,
            perPage: 24,
            totalItems: 1,
            totalPages: 1
          },
          sorting: {
            sortBy: 'title',
            order: 'asc'
          },
          search: {
            title: '',
            author: '',
            organisations: [],
            status: []
          },
          filters: mockFilters
        }
      })
    })

    test('GET /forms with pagination and sorting parameters returns sorted paginated data', async () => {
      jest.mocked(listForms).mockResolvedValue({
        forms: [stubFormMetadataOutput],
        totalItems: 1,
        filters: mockFilters
      })

      const response = await server.inject({
        method: 'GET',
        url: '/forms?page=1&perPage=5&sortBy=title&order=asc',
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({
        data: [stubFormMetadataOutput],
        meta: {
          pagination: {
            page: 1,
            perPage: 5,
            totalItems: 1,
            totalPages: 1
          },
          sorting: {
            sortBy: 'title',
            order: 'asc'
          },
          search: {
            title: '',
            author: '',
            organisations: [],
            status: []
          },
          filters: mockFilters
        }
      })
    })

    test('GET /forms with pagination parameters returns paginated data and default sorting', async () => {
      jest.mocked(listForms).mockResolvedValue({
        forms: [stubFormMetadataOutput],
        totalItems: 1,
        filters: mockFilters
      })

      const response = await server.inject({
        method: 'GET',
        url: '/forms?page=1&perPage=10',
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({
        data: [stubFormMetadataOutput],
        meta: {
          pagination: {
            page: 1,
            perPage: 10,
            totalItems: 1,
            totalPages: 1
          },
          sorting: {
            sortBy: 'updatedAt',
            order: 'desc'
          },
          search: {
            title: '',
            author: '',
            organisations: [],
            status: []
          },
          filters: mockFilters
        }
      })
    })

    test('GET /forms with pagination parameters returns empty data array and default sorting when no forms are available', async () => {
      jest.mocked(listForms).mockResolvedValue({
        forms: [],
        totalItems: 1,
        filters: mockFilters
      })

      const response = await server.inject({
        method: 'GET',
        url: '/forms?page=2&perPage=10',
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({
        data: [],
        meta: {
          pagination: {
            page: 2,
            perPage: 10,
            totalItems: 1,
            totalPages: 1
          },
          sorting: {
            sortBy: 'updatedAt',
            order: 'desc'
          },
          search: {
            title: '',
            author: '',
            organisations: [],
            status: []
          },
          filters: mockFilters
        }
      })
    })

    test('Testing POST /forms route returns a "created" status', async () => {
      jest.mocked(createForm).mockResolvedValue(stubFormMetadataOutput)

      const response = await server.inject({
        method: 'POST',
        url: '/forms',
        payload: stubFormMetadataInput,
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        id: stubFormMetadataOutput.id,
        slug: 'test-form',
        status: 'created'
      })
    })

    test('Testing PATCH /forms/{id} route returns "updated" status with id and slug', async () => {
      jest.mocked(getForm).mockResolvedValue(stubFormMetadataOutput)
      jest.mocked(updateFormMetadata).mockResolvedValue('test-form')

      const response = await server.inject({
        method: 'PATCH',
        url: '/forms/661e4ca5039739ef2902b214',
        payload: stubFormMetadataInput,
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        id: stubFormMetadataOutput.id,
        slug: 'test-form',
        status: 'updated'
      })
    })

    test('Testing PATCH /forms/{id} route with privacyNoticeUrl returns "updated" status', async () => {
      jest.mocked(getForm).mockResolvedValue(stubFormMetadataOutput) // Mock draft form (no live property)
      jest.mocked(updateFormMetadata).mockResolvedValue('test-form')

      const response = await server.inject({
        method: 'PATCH',
        url: '/forms/661e4ca5039739ef2902b214',
        payload: {
          privacyNoticeUrl: 'https://www.gov.uk/help/privacy-notice'
        },
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        id: stubFormMetadataOutput.id,
        slug: 'test-form',
        status: 'updated'
      })
    })

    test('Testing DELETE /forms/{id} route returns a "deleted" status', async () => {
      const response = await server.inject({
        method: 'DELETE',
        url: `/forms/${id}`,
        auth,
        payload: {}
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        id,
        status: 'deleted'
      })
      expect(removeForm).toHaveBeenCalledWith(id, {
        displayName: 'Enrique Chase',
        id: '86758ba9-92e7-4287-9751-7705e449688e'
      })
    })

    test('Testing DELETE /forms/{id}/draft route returns a "deleted" status', async () => {
      const response = await server.inject({
        method: 'DELETE',
        url: `/forms/${id}/draft`,
        auth,
        payload: {}
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        id,
        status: 'deleted'
      })
      expect(deleteDraftFormDefinition).toHaveBeenCalledWith(id, {
        displayName: 'Enrique Chase',
        id: '86758ba9-92e7-4287-9751-7705e449688e'
      })
    })

    test('Testing GET /forms/{id} route returns a form', async () => {
      jest.mocked(getForm).mockResolvedValue(stubFormMetadataOutput)

      const response = await server.inject({
        method: 'GET',
        url: `/forms/${id}`
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual(stubFormMetadataOutput)
    })

    test('Testing GET /forms/slug/{slug} route returns a form', async () => {
      jest.mocked(getFormBySlug).mockResolvedValue(stubFormMetadataOutput)

      const response = await server.inject({
        method: 'GET',
        url: `/forms/slug/${slug}`
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual(stubFormMetadataOutput)
    })

    test('Testing GET /forms/{id}/definition route returns a form definition', async () => {
      jest.mocked(getFormDefinition).mockResolvedValue(stubFormDefinition)

      const response = await server.inject({
        method: 'GET',
        url: `/forms/${id}/definition`
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual(stubFormDefinition)
    })

    test('Testing GET /forms/{id}/definition/draft route returns a form definition', async () => {
      jest.mocked(getFormDefinition).mockResolvedValue(stubFormDefinition)

      const response = await server.inject({
        method: 'GET',
        url: `/forms/${id}/definition/draft`
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual(stubFormDefinition)
    })

    test('Testing GET /forms/{id}/definition/draft/migrate/v2 route migrates a form to v2 and returns a form definition', async () => {
      jest.mocked(migrateDefinitionToV2).mockResolvedValue(stubFormDefinition)

      const response = await server.inject({
        method: 'POST',
        url: `/forms/${id}/definition/draft/migrate/v2`,
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual(stubFormDefinition)
    })

    test('Testing POST /forms/{id}/create-live route returns a "created-live" status', async () => {
      jest.mocked(createLiveFromDraft).mockResolvedValue(undefined)

      const response = await server.inject({
        method: 'POST',
        url: `/forms/${id}/create-live`,
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        id: stubFormMetadataOutput.id,
        status: 'created-live'
      })
    })

    test('Testing POST /forms/{id}/create-draft route returns a "created-draft" status', async () => {
      jest.mocked(createDraftFromLive).mockResolvedValue(undefined)

      const response = await server.inject({
        method: 'POST',
        url: `/forms/${id}/create-draft`,
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        id: stubFormMetadataOutput.id,
        status: 'created-draft'
      })
    })

    test('Testing POST /forms/{id}/definition/draft with V1 form definition should update successfully', async () => {
      const v1FormDefinition = buildDefinition({
        name: 'Test Form V1',
        schema: SchemaVersion.V1,
        engine: undefined, // V1 forms don't have engine property
        startPage: '/summary',
        pages: [
          {
            title: 'Summary',
            path: '/summary',
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

      jest.mocked(updateDraftFormDefinition).mockResolvedValue(undefined)

      const response = await server.inject({
        method: 'POST',
        url: `/forms/${id}/definition/draft`,
        payload: v1FormDefinition,
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({
        id,
        status: 'updated'
      })

      expect(updateDraftFormDefinition).toHaveBeenCalledWith(
        id,
        expect.objectContaining({
          name: 'Test Form V1',
          schema: SchemaVersion.V1,
          startPage: '/summary'
        }),
        expect.objectContaining({
          displayName: 'Enrique Chase'
        })
      )
    })

    test('Testing POST /forms/{id}/definition/draft with V2 form definition should update successfully', async () => {
      const v2FormDefinition = buildDefinition({
        name: 'Test Form V2',
        schema: SchemaVersion.V2,
        engine: Engine.V2,
        startPage: '/summary',
        pages: [
          buildSummaryPage({
            id: '449a45f6-4541-4a46-91bd-8b8931b07b50',
            title: 'Summary',
            path: '/summary'
          })
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

      jest.mocked(updateDraftFormDefinition).mockResolvedValue(undefined)

      const response = await server.inject({
        method: 'POST',
        url: `/forms/${id}/definition/draft`,
        payload: v2FormDefinition,
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({
        id,
        status: 'updated'
      })

      expect(updateDraftFormDefinition).toHaveBeenCalledWith(
        id,
        expect.objectContaining({
          name: 'Test Form V2',
          schema: SchemaVersion.V2,
          engine: Engine.V2,
          startPage: '/summary'
        }),
        expect.objectContaining({
          displayName: 'Enrique Chase'
        })
      )
    })

    test('Testing POST /forms/{id}/definition/draft with V2 form having invalid schema value is rejected', async () => {
      const v2FormWithInvalidSchema = buildDefinition({
        name: 'Test Form V2',
        schema: /** @type {any} */ (999),
        engine: Engine.V2,
        startPage: '/summary',
        pages: [
          buildSummaryPage({
            id: '449a45f6-4541-4a46-91bd-8b8931b07b50',
            title: 'Summary',
            path: '/summary'
          })
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

      const response = await server.inject({
        method: 'POST',
        url: `/forms/${id}/definition/draft`,
        payload: v2FormWithInvalidSchema,
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        validation: {
          source: 'payload'
        }
      })
    })

    test('Testing POST /forms/{id}/definition/draft endpoint service error handling', async () => {
      const validFormDefinition = buildDefinition({
        name: 'Test Form',
        schema: SchemaVersion.V1,
        startPage: '/summary',
        pages: [
          {
            title: 'Summary',
            path: '/summary',
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

      jest
        .mocked(updateDraftFormDefinition)
        .mockRejectedValue(
          Boom.badRequest("Form with ID '123' has no draft state")
        )

      const response = await server.inject({
        method: 'POST',
        url: `/forms/${id}/definition/draft`,
        payload: validFormDefinition,
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        message: "Form with ID '123' has no draft state"
      })
    })
  })

  describe('Error responses', () => {
    test('Testing GET /forms route throws unknown error', async () => {
      jest.mocked(listForms).mockRejectedValueOnce(new Error('Unknown error'))

      const response = await server.inject({
        method: 'GET',
        url: '/forms',
        auth
      })

      expect(response.statusCode).toEqual(internalErrorStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'Internal Server Error',
        message: 'An internal server error occurred'
      })
    })

    test('Testing GET /forms route with invalid pagination parameters returns validation error', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/forms?page=abc&perPage=-5',
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        message:
          '"page" must be a number. "perPage" must be a positive number. "perPage" must be greater than or equal to 1',
        validation: {
          keys: ['page', 'perPage', 'perPage'],
          source: 'query'
        }
      })
    })

    test('Testing DELETE /forms/{id} route returns internal server error', async () => {
      jest.mocked(removeForm).mockRejectedValueOnce('error')

      const response = await server.inject({
        method: 'DELETE',
        url: `/forms/${id}`,
        auth,
        payload: {}
      })

      expect(response.statusCode).toEqual(internalErrorStatusCode)
    })

    const invalidPayloadErrorsTestData = [
      {
        payload: {
          title: '',
          organisation: '',
          teamName: '',
          teamEmail: ''
        },
        error: {
          keys: [
            'title',
            'organisation',
            'organisation',
            'teamName',
            'teamEmail'
          ],
          messages: [
            '"title" is not allowed to be empty.',
            `"organisation" must be one of [${organisations.join(', ')}].`,
            '"organisation" is not allowed to be empty.',
            '"teamName" is not allowed to be empty.',
            '"teamEmail" is not allowed to be empty'
          ]
        }
      },
      {
        payload: {
          title: 'x'.repeat(251),
          organisation: 'Defra',
          teamName: 'teamname',
          teamEmail: 'defraforms@defra.gov.uk'
        },
        error: {
          keys: ['title'],
          messages: [
            '"title" length must be less than or equal to 250 characters long'
          ]
        }
      },
      {
        payload: {
          title: 'title',
          organisation: 'Cyberdyne Systems',
          teamName: 'teamname',
          teamEmail: 'defraforms@defra.gov.uk'
        },
        error: {
          keys: ['organisation'],
          messages: [
            `"organisation" must be one of [${organisations.join(', ')}]`
          ]
        }
      },
      {
        payload: {
          title: 'title',
          organisation: 'Defra',
          teamName: 'x'.repeat(101),
          teamEmail: 'defraforms@defra.gov.uk'
        },
        error: {
          keys: ['teamName'],
          messages: [
            '"teamName" length must be less than or equal to 100 characters long'
          ]
        }
      },
      {
        payload: {
          title: 'title',
          organisation: 'Defra',
          teamName: 'teamname',
          teamEmail: `x`
        },
        error: {
          keys: ['teamEmail'],
          messages: ['"teamEmail" must be a valid email']
        }
      },
      {
        payload: {
          title: 'title',
          organisation: 'Defra',
          teamName: 'teamname',
          teamEmail: 'defraforms@defra.gov.uk',
          slug: 'test-title'
        },
        error: {
          keys: ['slug'],
          messages: ['"slug" is not allowed']
        }
      }
    ]

    test.each([
      {
        payload: {},
        error: {
          keys: ['title', 'organisation', 'teamName', 'teamEmail'],
          messages: [
            '"title" is required.',
            '"organisation" is required.',
            '"teamName" is required.',
            '"teamEmail" is required'
          ]
        }
      },
      {
        payload: {
          title: 'title',
          organisation: 'Defra',
          teamName: 'teamname',
          teamEmail: 'defraforms@defra.gov.uk',
          privacyNoticeUrl: 'https://www.gov.uk/help/privacy-notice'
        },
        error: {
          keys: ['privacyNoticeUrl'],
          messages: ['"privacyNoticeUrl" is not allowed']
        }
      },
      ...invalidPayloadErrorsTestData
    ])(
      'Testing POST /forms route with an invalid payload returns validation errors',
      async ({ payload: metadata, error }) => {
        const response = await server.inject({
          method: 'POST',
          url: '/forms',
          payload: metadata,
          auth
        })

        expect(response.statusCode).toEqual(badRequestStatusCode)
        expect(response.headers['content-type']).toContain(jsonContentType)
        expect(response.result).toMatchObject({
          error: 'Bad Request',
          message: error.messages.join(' '),
          validation: {
            keys: error.keys,
            source: 'payload'
          }
        })
      }
    )

    test.each([
      {
        payload: {
          privacyNoticeUrl: '/privacy-notice'
        },
        error: {
          keys: ['privacyNoticeUrl'],
          messages: [
            '"privacyNoticeUrl" must be a valid uri with a scheme matching the http|https pattern'
          ]
        }
      },
      {
        payload: {
          privacyNoticeUrl: 'www.gov.uk/help/privacy-notice'
        },
        error: {
          keys: ['privacyNoticeUrl'],
          messages: [
            '"privacyNoticeUrl" must be a valid uri with a scheme matching the http|https pattern'
          ]
        }
      },
      ...invalidPayloadErrorsTestData
    ])(
      'Testing PATCH /forms/id route with an invalid payload returns validation errors',
      async ({ payload: metadata, error }) => {
        const response = await server.inject({
          method: 'PATCH',
          url: '/forms/661e4ca5039739ef2902b214',
          payload: metadata,
          auth
        })

        expect(response.statusCode).toEqual(badRequestStatusCode)
        expect(response.headers['content-type']).toContain(jsonContentType)
        expect(response.result).toMatchObject({
          error: 'Bad Request',
          message: error.messages.join(' '),
          validation: {
            keys: error.keys,
            source: 'payload'
          }
        })
      }
    )

    test('Testing PATCH /forms/{id} route on live form without FormPublish scope returns 403 Forbidden', async () => {
      const liveForm = {
        ...stubFormMetadataOutput,
        live: {
          createdAt: now,
          createdBy: author,
          updatedAt: now,
          updatedBy: author
        }
      }

      const authWithoutPublishScope = {
        ...auth,
        credentials: {
          ...auth.credentials,
          scope: ['form-edit', 'form-read'] // Missing form-publish
        }
      }

      jest.mocked(getForm).mockResolvedValue(liveForm)

      const response = await server.inject({
        method: 'PATCH',
        url: '/forms/661e4ca5039739ef2902b214',
        payload: { teamName: 'Updated Team Name' },
        auth: authWithoutPublishScope
      })

      expect(response.statusCode).toBe(403)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'Forbidden',
        message: 'Form is live - FormPublish scope required to update metadata'
      })
    })

    test('Testing PATCH /forms/{id} route on live form with FormPublish scope succeeds', async () => {
      const liveForm = {
        ...stubFormMetadataOutput,
        live: {
          createdAt: now,
          createdBy: author,
          updatedAt: now,
          updatedBy: author
        }
      }

      jest.mocked(getForm).mockResolvedValue(liveForm)
      jest.mocked(updateFormMetadata).mockResolvedValue('test-form')

      const response = await server.inject({
        method: 'PATCH',
        url: '/forms/661e4ca5039739ef2902b214',
        payload: { teamName: 'Updated Team Name' },
        auth // This includes form-publish scope
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        id: stubFormMetadataOutput.id,
        slug: 'test-form',
        status: 'updated'
      })
    })

    test('Testing PATCH /forms/{id} route on draft form without FormPublish scope succeeds', async () => {
      const draftForm = {
        ...stubFormMetadataOutput
        // No live property = draft form
      }

      jest.mocked(getForm).mockResolvedValue(draftForm)
      jest.mocked(updateFormMetadata).mockResolvedValue('test-form')

      const authWithoutPublishScope = {
        ...auth,
        credentials: {
          ...auth.credentials,
          scope: ['form-edit', 'form-read'] // Missing form-publish, but should still work for draft forms
        }
      }

      const response = await server.inject({
        method: 'PATCH',
        url: '/forms/661e4ca5039739ef2902b214',
        payload: { teamName: 'Updated Team Name' },
        auth: authWithoutPublishScope
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        id: stubFormMetadataOutput.id,
        slug: 'test-form',
        status: 'updated'
      })
    })

    test('Testing POST /forms route with a slug that already exists returns 400 FormAlreadyExistsError', async () => {
      jest
        .mocked(createForm)
        .mockRejectedValue(new FormAlreadyExistsError('my-title'))

      const response = await server.inject({
        method: 'POST',
        url: '/forms',
        payload: {
          title: 'My Title',
          organisation: 'Defra',
          teamName: 'teamname',
          teamEmail: 'defraforms@defra.gov.uk'
        },
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'FormAlreadyExistsError',
        message: 'Form with slug my-title already exists'
      })
    })

    test.each([
      {
        url: '/forms/1',
        error: {
          keys: ['id'],
          messages: ['"id" length must be 24 characters long']
        }
      },
      {
        url: `/forms/${'x'.repeat(24)}`,
        error: {
          keys: ['id'],
          messages: ['"id" must only contain hexadecimal characters']
        }
      }
    ])(
      'Testing GET /forms/{id} route with an invalid id returns validation errors',
      async ({ url, error }) => {
        const response = await server.inject({ method: 'GET', url })

        expect(response.statusCode).toEqual(badRequestStatusCode)
        expect(response.headers['content-type']).toContain(jsonContentType)
        expect(response.result).toMatchObject({
          error: 'Bad Request',
          message: error.messages.join(' '),
          validation: {
            keys: error.keys,
            source: 'params'
          }
        })
      }
    )

    test('Testing GET /forms/{id} route with an ID that is not found returns 404 Not found', async () => {
      jest
        .mocked(getForm)
        .mockRejectedValue(Boom.notFound(`Form with ID '${id}' not found`))

      const response = await server.inject({
        method: 'GET',
        url: `/forms/${id}`
      })

      expect(response.statusCode).toEqual(notFoundStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'Not Found',
        message: `Form with ID '${id}' not found`
      })
    })

    test('Testing GET /forms/{slug} route with a slug that is not found returns 404 Not found', async () => {
      jest
        .mocked(getFormBySlug)
        .mockRejectedValue(Boom.notFound(`Form with slug '${slug}' not found`))

      const response = await server.inject({
        method: 'GET',
        url: `/forms/slug/${slug}`
      })

      expect(response.statusCode).toEqual(notFoundStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'Not Found',
        message: `Form with slug '${slug}' not found`
      })
    })

    test.each([
      {
        url: '/forms/1/definition/draft',
        error: {
          keys: ['id'],
          messages: ['"id" length must be 24 characters long']
        }
      },
      {
        url: `/forms/${'x'.repeat(24)}/definition/draft`,
        error: {
          keys: ['id'],
          messages: ['"id" must only contain hexadecimal characters']
        }
      }
    ])(
      'Testing GET /forms/{id}/definition/draft route with an invalid id returns validation errors',
      async ({ url, error }) => {
        const response = await server.inject({ method: 'GET', url })

        expect(response.statusCode).toEqual(badRequestStatusCode)
        expect(response.headers['content-type']).toContain(jsonContentType)
        expect(response.result).toMatchObject({
          error: 'Bad Request',
          message: error.messages.join(' '),
          validation: {
            keys: error.keys,
            source: 'params'
          }
        })
      }
    )

    test('Testing GET /forms/{id}/definition/draft route with an id that is not found returns 404 Not found', async () => {
      jest.mocked(getFormDefinition).mockRejectedValue(Boom.notFound())

      const response = await server.inject({
        method: 'GET',
        url: `/forms/${id}/definition/draft`
      })

      expect(response.statusCode).toEqual(notFoundStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'Not Found',
        message: 'Not Found'
      })
    })

    test('Testing GET /forms/{id}/definition/draft route throws unknown error', async () => {
      jest
        .mocked(getFormDefinition)
        .mockRejectedValue(new Error('Unknown error'))

      const response = await server.inject({
        method: 'GET',
        url: `/forms/${id}/definition/draft`
      })

      expect(response.statusCode).toEqual(internalErrorStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'Internal Server Error',
        message: 'An internal server error occurred'
      })
    })

    test('Testing GET /forms route with invalid sorting field returns validation error', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/forms?sortBy=unknownField',
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        message: '"sortBy" must be one of [updatedAt, title]',
        validation: {
          keys: ['sortBy'],
          source: 'query'
        }
      })
    })

    test('Testing GET /forms route with invalid order value returns validation error', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/forms?order=ascending',
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        message: '"order" must be one of [asc, desc]',
        validation: {
          keys: ['order'],
          source: 'query'
        }
      })
    })

    test('Testing GET /forms route with invalid parameters and title', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/forms?page=-1&perPage=0&sortBy=invalid&title=test',
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        message:
          '"page" must be a positive number. "page" must be greater than or equal to 1. "perPage" must be a positive number. "perPage" must be greater than or equal to 1. "sortBy" must be one of [updatedAt, title]',
        validation: {
          keys: ['page', 'page', 'perPage', 'perPage', 'sortBy'],
          source: 'query'
        }
      })
    })

    test('Testing GET /forms route with title longer than 255 characters returns validation error', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/forms?title=${'x'.repeat(256)}`,
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        message:
          '"title" length must be less than or equal to 255 characters long',
        validation: {
          keys: ['title'],
          source: 'query'
        }
      })
    })

    test('Testing GET /forms route with invalid author returns validation error', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/forms?author=' + 'x'.repeat(101),
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        message:
          '"author" length must be less than or equal to 100 characters long',
        validation: {
          keys: ['author'],
          source: 'query'
        }
      })
    })

    test('Testing GET /forms route with invalid organisations returns validation error', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/forms?organisations=SomeOrg',
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        message:
          '"organisations" must be one of [Animal and Plant Health Agency – APHA, Centre for Environment, Fisheries and Aquaculture Science – Cefas, Defra, Environment Agency, Forestry Commission, Marine Management Organisation – MMO, Natural England, Rural Payments Agency – RPA, Veterinary Medicines Directorate – VMD]',
        validation: {
          keys: ['organisations'],
          source: 'query'
        }
      })
    })

    test('Testing GET /forms route with invalid status returns validation error', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/forms?status=non-status',
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        message: '"status" must be one of [draft, live]',
        validation: {
          keys: ['status'],
          source: 'query'
        }
      })
    })

    test('Testing GET /forms route with multiple invalid search parameters returns validation errors', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/forms?organisations=SomeOrg&status=non-status',
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        message:
          '"organisations" must be one of [Animal and Plant Health Agency – APHA, Centre for Environment, Fisheries and Aquaculture Science – Cefas, Defra, Environment Agency, Forestry Commission, Marine Management Organisation – MMO, Natural England, Rural Payments Agency – RPA, Veterinary Medicines Directorate – VMD]. "status" must be one of [draft, live]',
        validation: {
          keys: ['organisations', 'status'],
          source: 'query'
        }
      })
    })

    test('Testing POST /forms/{id}/definition/draft with invalid form definition returns validation errors', async () => {
      const invalidFormDefinition = {
        invalidProperty: 'should not be allowed',
        name: 'Test Form',
        schema: 3,
        pages: 'invalid pages format'
      }

      const response = await server.inject({
        method: 'POST',
        url: `/forms/${id}/definition/draft`,
        payload: invalidFormDefinition,
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        message: expect.stringContaining(
          'does not match any of the allowed types'
        ),
        validation: {
          source: 'payload'
        }
      })
    })

    test('Testing POST /forms/{id}/definition/draft with missing required fields returns validation errors', async () => {
      const incompleteFormDefinition = {
        // Missing required fields like name, pages, etc.
      }

      const response = await server.inject({
        method: 'POST',
        url: `/forms/${id}/definition/draft`,
        payload: incompleteFormDefinition,
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        validation: {
          source: 'payload'
        }
      })
    })
  })

  describe('Version endpoints', () => {
    test('GET /forms/{id}/versions returns list of versions', async () => {
      const mockVersions = [
        {
          formId: id,
          versionNumber: 1,
          createdAt: now,
          formDefinition: stubFormDefinition
        },
        {
          formId: id,
          versionNumber: 2,
          createdAt: now,
          formDefinition: stubFormDefinition
        }
      ]

      jest.mocked(getFormVersions).mockResolvedValue(mockVersions)

      const response = await server.inject({
        method: 'GET',
        url: `/forms/${id}/versions`,
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({
        versions: [
          { versionNumber: 1, createdAt: now },
          { versionNumber: 2, createdAt: now }
        ]
      })
    })

    test('GET /forms/{id}/versions/{versionNumber} returns specific version', async () => {
      const mockVersion = {
        formId: id,
        versionNumber: 1,
        createdAt: now,
        formDefinition: stubFormDefinition
      }

      jest.mocked(getFormVersion).mockResolvedValue(mockVersion)

      const response = await server.inject({
        method: 'GET',
        url: `/forms/${id}/versions/1`,
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({
        versionNumber: 1,
        createdAt: now
      })
    })

    test('GET /forms/{id}/versions/{versionNumber}/definition returns version definition', async () => {
      const mockVersion = {
        formId: id,
        versionNumber: 1,
        createdAt: now,
        formDefinition: stubFormDefinition
      }

      jest.mocked(getFormVersion).mockResolvedValue(mockVersion)

      const response = await server.inject({
        method: 'GET',
        url: `/forms/${id}/versions/1/definition`,
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual(stubFormDefinition)
    })

    test('GET /forms/{id}/versions handles error', async () => {
      jest
        .mocked(getFormVersions)
        .mockRejectedValue(Boom.notFound('Form not found'))

      const response = await server.inject({
        method: 'GET',
        url: `/forms/${id}/versions`,
        auth
      })

      expect(response.statusCode).toEqual(notFoundStatusCode)
    })

    test('GET /forms/{id}/versions/{versionNumber} handles version not found', async () => {
      jest
        .mocked(getFormVersion)
        .mockRejectedValue(Boom.notFound('Version not found'))

      const response = await server.inject({
        method: 'GET',
        url: `/forms/${id}/versions/999`,
        auth
      })

      expect(response.statusCode).toEqual(notFoundStatusCode)
    })
  })

  describe('Form state management endpoints', () => {
    test('POST /forms/{id}/create-live creates live from draft', async () => {
      jest.mocked(createLiveFromDraft).mockResolvedValue()

      const response = await server.inject({
        method: 'POST',
        url: `/forms/${id}/create-live`,
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({
        id,
        status: 'created-live'
      })
      expect(createLiveFromDraft).toHaveBeenCalledWith(id, author)
    })

    test('POST /forms/{id}/create-draft creates draft from live', async () => {
      jest.mocked(createDraftFromLive).mockResolvedValue()

      const response = await server.inject({
        method: 'POST',
        url: `/forms/${id}/create-draft`,
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({
        id,
        status: 'created-draft'
      })
      expect(createDraftFromLive).toHaveBeenCalledWith(id, author)
    })

    test('POST /forms/{id}/create-live handles error', async () => {
      jest
        .mocked(createLiveFromDraft)
        .mockRejectedValue(Boom.badRequest('No draft to publish'))

      const response = await server.inject({
        method: 'POST',
        url: `/forms/${id}/create-live`,
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        message: 'No draft to publish'
      })
    })

    test('POST /forms/{id}/create-draft handles error', async () => {
      jest
        .mocked(createDraftFromLive)
        .mockRejectedValue(Boom.badRequest('No live version to copy'))

      const response = await server.inject({
        method: 'POST',
        url: `/forms/${id}/create-draft`,
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        message: 'No live version to copy'
      })
    })
  })

  describe('Form migration endpoint', () => {
    test('POST /forms/{id}/definition/draft/migrate/{version} migrates form to V2', async () => {
      jest.mocked(migrateDefinitionToV2).mockResolvedValue(stubFormDefinition)

      const response = await server.inject({
        method: 'POST',
        url: `/forms/${id}/definition/draft/migrate/v2`,
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual(stubFormDefinition)
      expect(migrateDefinitionToV2).toHaveBeenCalledWith(id, author)
    })

    test('POST /forms/{id}/definition/draft/migrate/{version} handles migration errors', async () => {
      jest
        .mocked(migrateDefinitionToV2)
        .mockRejectedValue(Boom.badRequest('Already migrated'))

      const response = await server.inject({
        method: 'POST',
        url: `/forms/${id}/definition/draft/migrate/v2`,
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        message: 'Already migrated'
      })
    })
  })

  describe('Additional GET endpoints', () => {
    test('GET /forms/{id}/definition returns live definition', async () => {
      jest.mocked(getFormDefinition).mockResolvedValue(stubFormDefinition)

      const response = await server.inject({
        method: 'GET',
        url: `/forms/${id}/definition`,
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual(stubFormDefinition)
      expect(getFormDefinition).toHaveBeenCalledWith(id, FormStatus.Live)
    })

    test('GET /forms/{id}/definition/draft returns draft definition', async () => {
      jest.mocked(getFormDefinition).mockResolvedValue(stubFormDefinition)

      const response = await server.inject({
        method: 'GET',
        url: `/forms/${id}/definition/draft`,
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual(stubFormDefinition)
      expect(getFormDefinition).toHaveBeenCalledWith(id)
    })

    test('GET /forms/slug/{slug} returns form by slug', async () => {
      jest.mocked(getFormBySlug).mockResolvedValue(stubFormMetadataOutput)

      const response = await server.inject({
        method: 'GET',
        url: `/forms/slug/${slug}`,
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual(stubFormMetadataOutput)
      expect(getFormBySlug).toHaveBeenCalledWith(slug)
    })

    test('GET /forms/slug/{slug} handles not found', async () => {
      jest
        .mocked(getFormBySlug)
        .mockRejectedValue(Boom.notFound('Form not found'))

      const response = await server.inject({
        method: 'GET',
        url: '/forms/slug/non-existent-slug',
        auth
      })

      expect(response.statusCode).toEqual(notFoundStatusCode)
      expect(response.result).toMatchObject({
        error: 'Not Found',
        message: 'Form not found'
      })
    })
  })

  describe('PATCH endpoint with permissions', () => {
    test('PATCH /forms/{id} updates metadata when form has no live version', async () => {
      jest.mocked(getForm).mockResolvedValue({
        ...stubFormMetadataOutput,
        live: undefined
      })
      jest.mocked(updateFormMetadata).mockResolvedValue(slug)

      const response = await server.inject({
        method: 'PATCH',
        url: `/forms/${id}`,
        payload: { title: 'Updated Title' },
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.result).toEqual({
        id,
        slug,
        status: 'updated'
      })
    })

    test('PATCH /forms/{id} throws forbidden when form is live without FormPublish scope', async () => {
      jest.mocked(getForm).mockResolvedValue({
        ...stubFormMetadataOutput,
        live: {
          createdAt: now,
          createdBy: author,
          updatedAt: now,
          updatedBy: author
        }
      })

      const response = await server.inject({
        method: 'PATCH',
        url: `/forms/${id}`,
        payload: { title: 'Updated Title' },
        auth: {
          ...auth,
          credentials: {
            ...auth.credentials,
            scope: [Scopes.FormEdit]
          }
        }
      })

      expect(response.statusCode).toBe(403)
      expect(response.result).toMatchObject({
        error: 'Forbidden',
        message: 'Form is live - FormPublish scope required to update metadata'
      })
    })

    test('PATCH /forms/{id} updates metadata when form is live with FormPublish scope', async () => {
      jest.mocked(getForm).mockResolvedValue({
        ...stubFormMetadataOutput,
        live: {
          createdAt: now,
          createdBy: author,
          updatedAt: now,
          updatedBy: author
        }
      })
      jest.mocked(updateFormMetadata).mockResolvedValue(slug)

      const response = await server.inject({
        method: 'PATCH',
        url: `/forms/${id}`,
        payload: { title: 'Updated Title' },
        auth: {
          ...auth,
          credentials: {
            ...auth.credentials,
            scope: [Scopes.FormEdit, Scopes.FormPublish]
          }
        }
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.result).toEqual({
        id,
        slug,
        status: 'updated'
      })
    })
  })
})

/**
 * @import { FormDefinition, FormMetadata, FormMetadataAuthor, FormMetadataInput, FilterOptions } from '@defra/forms-model'
 * @import { Server } from '@hapi/hapi'
 */
