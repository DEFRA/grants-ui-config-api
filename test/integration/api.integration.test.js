import { ComponentType, ControllerType, Engine, FormStatus, SchemaVersion } from '@defra/forms-model'
import Boom from '@hapi/boom'

import { buildDefinition, buildList, buildSummaryPage } from '~/src/api/forms/__stubs__/definition.js'
import {
  createComponentOnDraftDefinition,
  deleteComponentOnDraftDefinition,
  updateComponentOnDraftDefinition
} from '~/src/api/forms/service/component.js'
import {
  createLiveFromDraft,
  getFormDefinition,
  listForms,
  reorderDraftFormDefinitionPages,
  updateDraftFormDefinition
} from '~/src/api/forms/service/definition.js'
import { createForm, getForm, getFormBySlug, removeForm, updateFormMetadata } from '~/src/api/forms/service/index.js'
import {
  addListToDraftFormDefinition,
  removeListOnDraftFormDefinition,
  updateListOnDraftFormDefinition
} from '~/src/api/forms/service/lists.js'
import { migrateDefinitionToV2 } from '~/src/api/forms/service/migration.js'
import { updateOptionOnDraftDefinition } from '~/src/api/forms/service/options.js'
import {
  createPageOnDraftDefinition,
  deletePageOnDraftDefinition,
  patchFieldsOnDraftDefinitionPage
} from '~/src/api/forms/service/page.js'
import { assignSectionsToForm } from '~/src/api/forms/service/sections.js'
import { createServer } from '~/src/api/server.js'
import { auth } from '~/test/fixtures/auth.js'

// Set longer timeout for integration tests
jest.setTimeout(30000)

// Mock all external dependencies
jest.mock('~/src/mongo.js')
jest.mock('~/src/messaging/publish.js')
jest.mock('~/src/api/forms/service/index.js')
jest.mock('~/src/api/forms/service/definition.js')
jest.mock('~/src/api/forms/service/page.js')
jest.mock('~/src/api/forms/service/component.js')
jest.mock('~/src/api/forms/service/lists.js')
jest.mock('~/src/api/forms/service/sections.js')
jest.mock('~/src/api/forms/service/options.js')
jest.mock('~/src/api/forms/service/migration.js')
jest.mock('~/src/api/forms/service/conditions.js')
jest.mock('~/src/api/forms/service/versioning.js')

describe('API Integration Tests', () => {
  /** @type {Server} */
  let server
  /** @type {Record<string, any>} */
  const testState = {}

  // Test data
  const now = new Date()
  const author = { id: 'test-service-001', displayName: 'Test Service' }
  const okStatusCode = 200
  const badRequestStatusCode = 400
  const jsonContentType = 'application/json'

  // Test IDs
  const formId = '661e4ca5039739ef2902b214'
  const formSlug = 'api-test-form'
  const pageIdUUID = '449a45f6-4541-4a46-91bd-8b8931b07b50'
  const pageId = '99201e2a-6cbf-4d85-a6e8-9e7321bdb539'
  const pageId2 = '113ad19c-effa-42a4-87d0-25b348403a88'
  const pageId3 = '8dbb7d08-5516-4c1b-b717-0d51877d4585'
  const componentId = 'd9434ad3-01a6-436f-80ce-f182ca05045c'
  const listId = 'c970583a-671a-4cea-aa1a-06a5e79e6979'
  const largeListId = 'fdc9ffd2-e508-4647-a713-57985723d475'
  const sectionId = '62201cb2-779a-4fd2-83aa-146c425c8e94'
  const goLiveFormId = '661e4ca5039739ef2902b21c'

  /**
   * @satisfies {FormMetadata}
   */
  const formMetadata = {
    id: formId,
    slug: formSlug,
    title: 'API test form',
    organisation: 'Defra',
    teamName: 'Forms Team',
    teamEmail: 'name@example.gov.uk',
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

  const goLiveFormMetadata = {
    id: goLiveFormId,
    slug: 'form-to-go-live',
    title: 'Form to go live',
    organisation: 'Defra',
    teamName: 'Forms Team',
    teamEmail: 'name@example.gov.uk',
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
  const formDefinition = buildDefinition({
    name: 'API test form',
    startPage: '/summary',
    pages: [
      buildSummaryPage({
        id: pageIdUUID,
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
    lists: [
      buildList({
        id: listId,
        title: 'Example list',
        name: 'KRcpKo',
        type: 'string',
        items: [
          { text: 'hello', value: 'hello' },
          { text: 'world', value: 'world' }
        ]
      })
    ]
  })

  /**
   * @satisfies {FilterOptions}
   */
  const mockFilters = {
    authors: ['Test Service'],
    organisations: ['Defra'],
    status: [FormStatus.Draft]
  }

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()

    // Store IDs for later tests
    testState.formId = formId
    testState.formSlug = formSlug
    testState.pageIdUUID = pageIdUUID
    testState.pageId = pageId
    testState.pageId2 = pageId2
    testState.pageId3 = pageId3
    testState.componentId = componentId
    testState.listId = listId
    testState.largeListId = largeListId
    testState.sectionId = sectionId
    testState.goLiveFormId = goLiveFormId
  })

  afterAll(async () => {
    await server.stop()
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Health Check', () => {
    test('GET /health should return 200', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health'
      })

      expect(response.statusCode).toBe(okStatusCode)
      expect(response.result).toEqual({ message: 'success' })
    })
  })

  describe('Forms CRUD Operations', () => {
    test('GET /forms should return forms list', async () => {
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

      expect(response.statusCode).toBe(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toHaveProperty('data')
      /** @type {{ data: any[] }} */
      const result = /** @type {any} */ (response.result)
      expect(Array.isArray(result.data)).toBe(true)
    })

    test('GET /forms/slugs should return list of live form slugs', async () => {
      const liveForm1 = {
        ...formMetadata,
        id: '661e4ca5039739ef2902b220',
        slug: 'live-form-1',
        live: {
          createdAt: now,
          createdBy: author,
          updatedAt: now,
          updatedBy: author
        }
      }

      const liveForm2 = {
        ...formMetadata,
        id: '661e4ca5039739ef2902b221',
        slug: 'live-form-2',
        live: {
          createdAt: now,
          createdBy: author,
          updatedAt: now,
          updatedBy: author
        }
      }

      jest.mocked(listForms).mockResolvedValue({
        forms: [liveForm1, liveForm2],
        totalItems: 2,
        filters: { ...mockFilters, status: [FormStatus.Live] }
      })

      const response = await server.inject({
        method: 'GET',
        url: '/forms/slugs'
      })

      expect(response.statusCode).toBe(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toHaveProperty('slugs')
      /** @type {{ slugs: string[] }} */
      const result = /** @type {any} */ (response.result)
      expect(Array.isArray(result.slugs)).toBe(true)
      expect(result.slugs).toEqual(['live-form-1', 'live-form-2'])
    })

    test('GET /forms/slugs should return empty array when no live forms exist', async () => {
      jest.mocked(listForms).mockResolvedValue({
        forms: [],
        totalItems: 0,
        filters: { ...mockFilters, status: [FormStatus.Live] }
      })

      const response = await server.inject({
        method: 'GET',
        url: '/forms/slugs'
      })

      expect(response.statusCode).toBe(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({ slugs: [] })
    })

    test('POST /forms should create a new form', async () => {
      jest.mocked(createForm).mockResolvedValue(formMetadata)

      const formData = {
        title: 'API test form',
        organisation: 'Defra',
        teamName: 'Forms Team',
        teamEmail: 'name@example.gov.uk'
      }

      const response = await server.inject({
        method: 'POST',
        url: '/forms',
        payload: formData,
        auth
      })

      expect(response.statusCode).toBe(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toHaveProperty('id', formId)
      expect(response.result).toHaveProperty('slug', formSlug)
      expect(response.result).toHaveProperty('status', 'created')
    })

    test('PATCH /forms/:form_id should update form metadata', async () => {
      jest.mocked(getForm).mockResolvedValue(formMetadata)
      jest.mocked(updateFormMetadata).mockResolvedValue(formSlug)

      const updateData = {
        contact: {
          phone: '01234567890',
          email: {
            address: 'test@example.gov.uk',
            responseTime: '1 day'
          },
          online: {
            url: 'http://localhost:3000',
            text: 'Some text'
          }
        },
        submissionGuidance: 'Here is some guidance',
        privacyNoticeUrl: 'https://www.gov.uk/help/privacy-notice',
        notificationEmail: 'test@example.gov.uk'
      }

      const response = await server.inject({
        method: 'PATCH',
        url: `/forms/${formId}`,
        payload: updateData,
        auth
      })

      expect(response.statusCode).toBe(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toHaveProperty('status', 'updated')
    })

    test('GET /forms/:form_id should return specific form', async () => {
      jest.mocked(getForm).mockResolvedValue(formMetadata)

      const response = await server.inject({
        method: 'GET',
        url: `/forms/${formId}`
      })

      expect(response.statusCode).toBe(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toHaveProperty('id', formId)
    })

    test('GET /forms/slug/:form_slug should return form by slug', async () => {
      jest.mocked(getFormBySlug).mockResolvedValue(formMetadata)

      const response = await server.inject({
        method: 'GET',
        url: `/forms/slug/${formSlug}`
      })

      expect(response.statusCode).toBe(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toHaveProperty('slug', formSlug)
    })
  })

  describe('Form Definition Operations', () => {
    test('GET /forms/:form_id/definition/draft should return draft definition', async () => {
      jest.mocked(getFormDefinition).mockResolvedValue(formDefinition)

      const response = await server.inject({
        method: 'GET',
        url: `/forms/${formId}/definition/draft`
      })

      expect(response.statusCode).toBe(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toHaveProperty('pages')
      expect(response.result).toHaveProperty('lists')
      expect(response.result).toHaveProperty('sections')
      expect(response.result).toHaveProperty('conditions')
    })

    test('POST /forms/:form_id/definition/draft should update draft definition (V1)', async () => {
      const v1Definition = buildDefinition({
        name: 'API test form',
        schema: SchemaVersion.V1,
        startPage: '/summary',
        pages: [
          {
            id: pageIdUUID,
            title: 'Summary',
            path: '/summary',
            controller: ControllerType.Summary
          },
          {
            title: 'V1 Page',
            path: '/v1-page',
            components: [],
            controller: ControllerType.Page,
            next: []
          }
        ],
        conditions: [],
        sections: [
          {
            name: 'section',
            title: 'Section title'
          }
        ],
        lists: [
          buildList({
            id: listId,
            title: 'Example list',
            name: 'KRcpKo',
            type: 'string',
            items: [
              { text: 'hello', value: 'hello' },
              { text: 'world', value: 'world' }
            ]
          })
        ]
      })

      jest.mocked(updateDraftFormDefinition).mockResolvedValue(undefined)

      const response = await server.inject({
        method: 'POST',
        url: `/forms/${formId}/definition/draft`,
        payload: v1Definition,
        auth
      })

      expect(response.statusCode).toBe(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toHaveProperty('status', 'updated')
    })

    test('POST /forms/:form_id/definition/draft/migrate/v2 should migrate to V2', async () => {
      const v2Definition = buildDefinition({
        name: 'API test form',
        schema: SchemaVersion.V2,
        engine: Engine.V2,
        startPage: '/v1-page',
        pages: [
          buildSummaryPage({
            id: pageIdUUID,
            title: 'V1 Page',
            path: '/v1-page'
          })
        ],
        conditions: [],
        sections: [],
        lists: []
      })

      jest.mocked(migrateDefinitionToV2).mockResolvedValue(v2Definition)

      const response = await server.inject({
        method: 'POST',
        url: `/forms/${formId}/definition/draft/migrate/v2`,
        auth
      })

      expect(response.statusCode).toBe(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toHaveProperty('engine', Engine.V2)
      /** @type {FormDefinition} */
      const result = /** @type {any} */ (response.result)
      expect(result.pages[0]).toHaveProperty('path', '/v1-page')
      expect(result.pages[0]).toHaveProperty('id')
    })
  })

  describe('Page Operations', () => {
    test('POST /forms/:form_id/definition/draft/pages should create page 3', async () => {
      /** @type {PageQuestion} */
      const page3Payload = {
        title: 'Question - should be page 3',
        path: '/page-3',
        components: [
          {
            title: 'Is this Page 3?',
            type: ComponentType.TextField,
            name: 'AbcDeH',
            options: {},
            schema: {}
          }
        ],
        next: []
      }

      const page3Response = {
        ...page3Payload,
        id: pageId3
      }

      jest.mocked(createPageOnDraftDefinition).mockResolvedValue(page3Response)

      const response = await server.inject({
        method: 'POST',
        url: `/forms/${formId}/definition/draft/pages`,
        payload: page3Payload,
        auth
      })

      expect(response.statusCode).toBe(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toHaveProperty('id')
    })

    test('POST /forms/:form_id/definition/draft/pages should create page 2', async () => {
      /** @type {PageQuestion} */
      const page2Payload = {
        title: 'What is your name to delete?',
        path: '/what-is-your-name-to-delete',
        components: [
          {
            title: 'What is your name to delete?',
            type: ComponentType.TextField,
            name: 'AbcDeG',
            options: {},
            schema: {}
          }
        ],
        next: []
      }

      const page2Response = {
        ...page2Payload,
        id: pageId2
      }

      jest.mocked(createPageOnDraftDefinition).mockResolvedValue(page2Response)

      const response = await server.inject({
        method: 'POST',
        url: `/forms/${formId}/definition/draft/pages`,
        payload: page2Payload,
        auth
      })

      expect(response.statusCode).toBe(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toHaveProperty('id')
    })

    test('POST /forms/:form_id/definition/draft/pages should create page 1', async () => {
      /** @type {PageQuestion} */
      const page1Payload = {
        title: 'What is your address?',
        path: '/what-is-your-address',
        components: [
          {
            title: 'What is your address?',
            type: ComponentType.TextField,
            name: 'AbcDeF',
            options: {},
            schema: {}
          }
        ],
        next: []
      }

      const page1Response = {
        ...page1Payload,
        id: pageId
      }

      jest.mocked(createPageOnDraftDefinition).mockResolvedValue(page1Response)

      const response = await server.inject({
        method: 'POST',
        url: `/forms/${formId}/definition/draft/pages`,
        payload: page1Payload,
        auth
      })

      expect(response.statusCode).toBe(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toHaveProperty('id')
    })

    test('POST /forms/:form_id/definition/draft/pages/order should reorder pages', async () => {
      const reorderedDefinition = buildDefinition({
        pages: [
          {
            id: pageId,
            title: 'What is your address?',
            path: '/what-is-your-address',
            components: [],
            next: []
          },
          {
            id: pageId2,
            title: 'What is your name to delete?',
            path: '/what-is-your-name-to-delete',
            components: [],
            next: []
          },
          {
            id: pageId3,
            title: 'Question - should be page 3',
            path: '/page-3',
            components: [],
            next: []
          },
          buildSummaryPage({
            id: pageIdUUID,
            title: 'V1 Page',
            path: '/v1-page'
          })
        ],
        conditions: [],
        sections: [],
        lists: []
      })

      jest.mocked(reorderDraftFormDefinitionPages).mockResolvedValue(reorderedDefinition)

      const pageOrder = [pageId, pageId2, pageId3, pageIdUUID]

      const response = await server.inject({
        method: 'POST',
        url: `/forms/${formId}/definition/draft/pages/order`,
        payload: pageOrder,
        auth
      })

      expect(response.statusCode).toBe(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      /** @type {FormDefinition} */
      const result = /** @type {any} */ (response.result)
      expect(result.pages[0]).toHaveProperty('path', '/what-is-your-address')
      expect(result.pages[1]).toHaveProperty('path', '/what-is-your-name-to-delete')
      expect(result.pages[2]).toHaveProperty('path', '/page-3')
      expect(result.pages[3]).toHaveProperty('path', '/v1-page')
    })

    test('PATCH /forms/:form_id/definition/draft/pages/:page_id should update page', async () => {
      const updatedPage = {
        id: pageId,
        title: 'What is your address, really?',
        path: '/what-is-your-address',
        components: [],
        next: []
      }

      jest.mocked(patchFieldsOnDraftDefinitionPage).mockResolvedValue(updatedPage)

      const updateData = {
        title: 'What is your address, really?'
      }

      const response = await server.inject({
        method: 'PATCH',
        url: `/forms/${formId}/definition/draft/pages/${pageIdUUID}`,
        payload: updateData,
        auth
      })

      expect(response.statusCode).toBe(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
    })

    test('DELETE /forms/:form_id/definition/draft/pages/:page_id should delete page', async () => {
      jest.mocked(deletePageOnDraftDefinition).mockResolvedValue(undefined)

      const response = await server.inject({
        method: 'DELETE',
        url: `/forms/${formId}/definition/draft/pages/${pageIdUUID}`,
        auth
      })

      expect(response.statusCode).toBe(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
    })
  })

  describe('Component Operations', () => {
    test('POST /forms/:form_id/definition/draft/pages/:page_id/components should create component', async () => {
      /** @type {RadiosFieldComponent} */
      const component = {
        id: componentId,
        name: 'Ghcbmw',
        title: 'Component Test',
        type: ComponentType.RadiosField,
        hint: '',
        list: listId,
        options: {}
      }

      jest.mocked(createComponentOnDraftDefinition).mockResolvedValue(component)

      const componentData = {
        name: 'Ghcbmw',
        title: 'Component Test',
        type: ComponentType.RadiosField,
        hint: '',
        list: listId,
        options: {}
      }

      const response = await server.inject({
        method: 'POST',
        url: `/forms/${formId}/definition/draft/pages/${pageIdUUID}/components`,
        payload: componentData,
        auth
      })

      expect(response.statusCode).toBe(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toHaveProperty('id', componentId)
    })

    test('PUT /forms/:form_id/definition/draft/pages/:page_id/components/:component_id should update component', async () => {
      /** @type {RadiosFieldComponent} */
      const updatedComponent = {
        id: componentId,
        name: 'Ghcbmw',
        title: 'Check add id 2',
        type: ComponentType.RadiosField,
        hint: '',
        list: listId,
        options: {}
      }

      jest.mocked(updateComponentOnDraftDefinition).mockResolvedValue(updatedComponent)

      const updateData = {
        name: 'Ghcbmw',
        title: 'Check add id 2',
        type: ComponentType.RadiosField,
        hint: '',
        list: listId,
        options: {},
        id: componentId
      }

      const response = await server.inject({
        method: 'PUT',
        url: `/forms/${formId}/definition/draft/pages/${pageIdUUID}/components/${componentId}`,
        payload: updateData,
        auth
      })

      expect(response.statusCode).toBe(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
    })

    test('DELETE /forms/:form_id/definition/draft/pages/:page_id/components/:component_id should delete component', async () => {
      jest.mocked(deleteComponentOnDraftDefinition).mockResolvedValue(undefined)

      const response = await server.inject({
        method: 'DELETE',
        url: `/forms/${formId}/definition/draft/pages/${pageIdUUID}/components/${componentId}`,
        auth
      })

      expect(response.statusCode).toBe(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toHaveProperty('status', 'deleted')
    })
  })

  describe('List Operations', () => {
    test('POST /forms/:form_id/definition/draft/lists should create list', async () => {
      const newList = buildList({
        id: listId,
        title: 'Development language',
        name: 'YhmNDD',
        type: 'string',
        items: [
          { text: 'Javascript', value: 'javascript' },
          { text: 'TypeScript', value: 'typescript' },
          { text: 'Python', value: 'python' },
          { text: 'Haskell', value: 'haskell' },
          { text: 'Erlang', value: 'erlang' },
          { text: 'Java', value: 'java' }
        ]
      })

      jest.mocked(addListToDraftFormDefinition).mockResolvedValue(newList)

      const listData = {
        title: 'Development language',
        name: 'YhmNDD',
        type: 'string',
        items: [
          { text: 'Javascript', value: 'javascript' },
          { text: 'TypeScript', value: 'typescript' },
          { text: 'Python', value: 'python' },
          { text: 'Haskell', value: 'haskell' },
          { text: 'Erlang', value: 'erlang' },
          { text: 'Java', value: 'java' }
        ]
      }

      const response = await server.inject({
        method: 'POST',
        url: `/forms/${formId}/definition/draft/lists`,
        payload: listData,
        auth
      })

      expect(response.statusCode).toBe(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toHaveProperty('id')
    })

    test('PUT /forms/:form_id/definition/draft/lists/:list_id should update list', async () => {
      const updatedList = buildList({
        id: listId,
        title: 'Development language',
        name: 'YhmNDP',
        type: 'string',
        items: [
          { text: 'Javascript', value: 'javascript' },
          { text: 'TypeScript', value: 'typescript' },
          { text: 'Python', value: 'python' },
          { text: 'Haskell', value: 'haskell' },
          { text: 'Erlang', value: 'erlang' },
          { text: 'Java', value: 'java' }
        ]
      })

      jest.mocked(updateListOnDraftFormDefinition).mockResolvedValue(updatedList)

      const updateData = {
        id: listId,
        title: 'Development language',
        name: 'YhmNDP',
        type: 'string',
        items: [
          { text: 'Javascript', value: 'javascript' },
          { text: 'TypeScript', value: 'typescript' },
          { text: 'Python', value: 'python' },
          { text: 'Haskell', value: 'haskell' },
          { text: 'Erlang', value: 'erlang' },
          { text: 'Java', value: 'java' }
        ]
      }

      const response = await server.inject({
        method: 'PUT',
        url: `/forms/${formId}/definition/draft/lists/${listId}`,
        payload: updateData,
        auth
      })

      expect(response.statusCode).toBe(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
    })

    test('POST /forms/:form_id/definition/draft/lists should create large list (periodic table)', async () => {
      // Generate 100 element periodic table list
      const periodicTableItems = Array.from({ length: 100 }, (_, i) => ({
        text: `Element ${i + 1}`,
        value: i + 1
      }))

      const largeList = buildList({
        id: largeListId,
        title: 'Periodic Table',
        name: 'PeriodicTable',
        type: 'number',
        items: periodicTableItems
      })

      jest.mocked(addListToDraftFormDefinition).mockResolvedValue(largeList)

      const listData = {
        title: 'Periodic Table',
        name: 'PeriodicTable',
        type: 'number',
        items: periodicTableItems
      }

      const response = await server.inject({
        method: 'POST',
        url: `/forms/${formId}/definition/draft/lists`,
        payload: listData,
        auth
      })

      expect(response.statusCode).toBe(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toHaveProperty('id')
    })

    test('PUT /forms/:form_id/definition/draft/lists/:list_id should return 400 for name conflict', async () => {
      jest
        .mocked(updateListOnDraftFormDefinition)
        .mockRejectedValue(Boom.badRequest('List with name YhmNDP already exists'))

      // Try to update with conflicting name
      const conflictData = {
        id: largeListId,
        title: 'Periodic Table Conflict',
        name: 'YhmNDP', // This name already exists
        type: 'number',
        items: [{ text: 'Test', value: 1 }]
      }

      const response = await server.inject({
        method: 'PUT',
        url: `/forms/${formId}/definition/draft/lists/${largeListId}`,
        payload: conflictData,
        auth
      })

      expect(response.statusCode).toBe(badRequestStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
    })

    test('DELETE /forms/:form_id/definition/draft/lists/:list_id should delete list', async () => {
      jest.mocked(removeListOnDraftFormDefinition).mockResolvedValue(undefined)

      const response = await server.inject({
        method: 'DELETE',
        url: `/forms/${formId}/definition/draft/lists/${largeListId}`,
        auth
      })

      expect(response.statusCode).toBe(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
    })
  })

  describe('Section Operations', () => {
    test('PUT /forms/:form_id/definition/draft/sections should add sections', async () => {
      const sections = [
        {
          id: sectionId,
          name: 'personal-details',
          title: 'Personal Details',
          pageIds: []
        },
        {
          id: '661e4ca5039739ef2902b21d',
          name: 'address-information',
          title: 'Address Information',
          pageIds: []
        }
      ]

      jest.mocked(assignSectionsToForm).mockResolvedValue(sections)

      const sectionsData = {
        sections: [
          {
            name: 'personal-details',
            title: 'Personal Details',
            pageIds: ['8a374ee0-29be-4509-b106-fbdb1a79c501']
          },
          {
            name: 'address-information',
            title: 'Address Information',
            pageIds: ['c19c0ef7-0798-4aae-b3d6-5b21cf88185d']
          }
        ],
        requestType: 'CREATE_SECTION'
      }

      const response = await server.inject({
        method: 'PUT',
        url: `/forms/${formId}/definition/draft/sections`,
        payload: sectionsData,
        auth
      })

      expect(response.statusCode).toBe(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toHaveProperty('status', 'updated')
      /** @type {{ sections: SectionAssignmentItem[] }} */
      const result = /** @type {any} */ (response.result)
      expect(result.sections).toHaveLength(2)
      expect(result.sections[0]).toHaveProperty('title', 'Personal Details')
      expect(result.sections[1]).toHaveProperty('title', 'Address Information')
      expect(result.sections[0]).toHaveProperty('id')
      expect(result.sections[1]).toHaveProperty('id')
    })

    test('PUT /forms/:form_id/definition/draft/sections should remove sections', async () => {
      /** @type {any[]} */
      const sections = []

      jest.mocked(assignSectionsToForm).mockResolvedValue(sections)

      const sectionsData = {
        sections: [],
        requestType: 'DELETE_SECTION'
      }

      const response = await server.inject({
        method: 'PUT',
        url: `/forms/${formId}/definition/draft/sections`,
        payload: sectionsData,
        auth
      })

      expect(response.statusCode).toBe(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toHaveProperty('status', 'updated')
      /** @type {{ sections: SectionAssignmentItem[] }} */
      const result = /** @type {any} */ (response.result)
      expect(result.sections).toHaveLength(0)
    })
  })

  describe('Form Definition Verification', () => {
    test('GET /forms/:form_id/definition/draft should return updated definition', async () => {
      jest.mocked(getFormDefinition).mockResolvedValue(formDefinition)

      const response = await server.inject({
        method: 'GET',
        url: `/forms/${formId}/definition/draft`
      })

      expect(response.statusCode).toBe(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toHaveProperty('pages')
      /** @type {FormDefinition} */
      const result = /** @type {any} */ (response.result)
      expect(Array.isArray(result.pages)).toBe(true)
    })
  })

  describe('Form Cleanup', () => {
    test('DELETE /forms/:form_id should delete form', async () => {
      jest.mocked(removeForm).mockResolvedValue(undefined)

      const response = await server.inject({
        method: 'DELETE',
        url: `/forms/${formId}`,
        auth,
        payload: {}
      })

      expect(response.statusCode).toBe(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
    })
  })

  describe('Go-Live Flow', () => {
    test('POST /forms should create form to go live', async () => {
      jest.mocked(createForm).mockResolvedValue(goLiveFormMetadata)

      const formData = {
        title: 'Form to go live',
        organisation: 'Defra',
        teamName: 'Forms Team',
        teamEmail: 'name@example.gov.uk'
      }

      const response = await server.inject({
        method: 'POST',
        url: '/forms',
        payload: formData,
        auth
      })

      expect(response.statusCode).toBe(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toHaveProperty('slug', 'form-to-go-live')
      expect(response.result).toHaveProperty('status', 'created')
      expect(response.result).toHaveProperty('id')
    })

    test('GET /forms should find the go-live form', async () => {
      jest.mocked(listForms).mockResolvedValue({
        forms: [goLiveFormMetadata],
        totalItems: 1,
        filters: mockFilters
      })

      const response = await server.inject({
        method: 'GET',
        url: '/forms',
        auth
      })

      expect(response.statusCode).toBe(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      /** @type {{ data: FormMetadata[] }} */
      const result = /** @type {any} */ (response.result)
      const goLiveForm = result.data.find((form) => form.slug === 'form-to-go-live')
      expect(goLiveForm).toBeDefined()
      expect(goLiveForm).toHaveProperty('id')
    })

    test('PATCH /forms/:form_id should update go-live form', async () => {
      jest.mocked(getForm).mockResolvedValue(goLiveFormMetadata)
      jest.mocked(updateFormMetadata).mockResolvedValue('form-to-go-live')

      const updateData = {
        contact: {
          phone: '01234567890',
          email: {
            address: 'test@example.gov.uk',
            responseTime: '1 day'
          },
          online: {
            url: 'http://localhost:3000',
            text: 'Some text'
          }
        },
        submissionGuidance: 'Here is some guidance',
        privacyNoticeUrl: 'https://www.gov.uk/help/privacy-notice',
        notificationEmail: 'test@example.gov.uk'
      }

      const response = await server.inject({
        method: 'PATCH',
        url: `/forms/${goLiveFormId}`,
        payload: updateData,
        auth
      })

      expect(response.statusCode).toBe(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toHaveProperty('status', 'updated')
    })

    test('POST /forms/:form_id/create-live should publish form', async () => {
      jest.mocked(createLiveFromDraft).mockResolvedValue(undefined)

      const response = await server.inject({
        method: 'POST',
        url: `/forms/${goLiveFormId}/create-live`,
        auth
      })

      expect(response.statusCode).toBe(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toHaveProperty('status', 'created-live')
    })

    describe('Form Options', () => {
      test('GET /forms/:form_id/definition/draft should show undefined showReferenceNumber initially', async () => {
        const definitionWithoutOptions = buildDefinition({
          name: 'Form to go live',
          pages: [],
          conditions: [],
          sections: [],
          lists: []
        })

        jest.mocked(getFormDefinition).mockResolvedValue(definitionWithoutOptions)

        const response = await server.inject({
          method: 'GET',
          url: `/forms/${goLiveFormId}/definition/draft`
        })

        expect(response.statusCode).toBe(okStatusCode)
        expect(response.headers['content-type']).toContain(jsonContentType)
        /** @type {FormDefinition} */
        const result = /** @type {any} */ (response.result)
        expect(result.options?.showReferenceNumber).toBeUndefined()
      })

      test('POST /forms/:form_id/definition/draft/options/showReferenceNumber should set to true', async () => {
        jest.mocked(updateOptionOnDraftDefinition).mockResolvedValue({ option: { showReferenceNumber: 'true' } })

        const response = await server.inject({
          method: 'POST',
          url: `/forms/${goLiveFormId}/definition/draft/options/showReferenceNumber`,
          payload: { optionValue: 'true' },
          auth
        })

        expect(response.statusCode).toBe(okStatusCode)
        expect(response.headers['content-type']).toContain(jsonContentType)
      })

      test('GET /forms/:form_id/definition/draft should show showReferenceNumber as true', async () => {
        const definitionWithTrueOption = buildDefinition({
          name: 'Form to go live',
          pages: [],
          conditions: [],
          sections: [],
          lists: [],
          options: {
            showReferenceNumber: true
          }
        })

        jest.mocked(getFormDefinition).mockResolvedValue(definitionWithTrueOption)

        const response = await server.inject({
          method: 'GET',
          url: `/forms/${goLiveFormId}/definition/draft`
        })

        expect(response.statusCode).toBe(okStatusCode)
        expect(response.headers['content-type']).toContain(jsonContentType)
        /** @type {FormDefinition} */
        const result = /** @type {any} */ (response.result)
        expect(result.options?.showReferenceNumber).toBe(true)
      })

      test('POST /forms/:form_id/definition/draft/options/showReferenceNumber should set to false', async () => {
        jest.mocked(updateOptionOnDraftDefinition).mockResolvedValue({ option: { showReferenceNumber: 'false' } })

        const response = await server.inject({
          method: 'POST',
          url: `/forms/${goLiveFormId}/definition/draft/options/showReferenceNumber`,
          payload: { optionValue: 'false' },
          auth
        })

        expect(response.statusCode).toBe(okStatusCode)
        expect(response.headers['content-type']).toContain(jsonContentType)
      })

      test('GET /forms/:form_id/definition/draft should show showReferenceNumber as false', async () => {
        const definitionWithFalseOption = buildDefinition({
          name: 'Form to go live',
          pages: [],
          conditions: [],
          sections: [],
          lists: [],
          options: {
            showReferenceNumber: false
          }
        })

        jest.mocked(getFormDefinition).mockResolvedValue(definitionWithFalseOption)

        const response = await server.inject({
          method: 'GET',
          url: `/forms/${goLiveFormId}/definition/draft`
        })

        expect(response.statusCode).toBe(okStatusCode)
        expect(response.headers['content-type']).toContain(jsonContentType)
        /** @type {FormDefinition} */
        const result = /** @type {any} */ (response.result)
        expect(result.options?.showReferenceNumber).toBe(false)
      })
    })
  })
})

/**
 * @import { FormDefinition, FormMetadata, FilterOptions, SectionAssignmentItem, PageQuestion, RadiosFieldComponent } from '@defra/forms-model'
 * @import { Server } from '@hapi/hapi'
 */
