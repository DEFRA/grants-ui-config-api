import { FormDefinitionError, FormDefinitionErrorType, FormDefinitionRequestType } from '@defra/forms-model'

import { assignSectionsToForm } from '~/src/api/forms/service/sections.js'
import { createServer } from '~/src/api/server.js'
import { auth } from '~/test/fixtures/auth.js'

jest.mock('~/src/mongo.js')
jest.mock('~/src/api/forms/service/sections.js')

describe('Sections route', () => {
  /** @type {Server} */
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(() => {
    return server.stop()
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  const okStatusCode = 200
  const badRequestStatusCode = 400
  const jsonContentType = 'application/json'
  const id = '661e4ca5039739ef2902b214'

  /**
   * Expected author derived from auth.credentials.user
   * @satisfies {FormMetadataAuthor}
   */
  const expectedAuthor = {
    id: auth.credentials.user.id,
    displayName: auth.credentials.user.displayName
  }

  describe('Success responses', () => {
    test('Testing PUT /forms/{id}/definition/draft/sections assigns sections to pages', async () => {
      /** @type {SectionAssignmentItem[]} */
      const sectionAssignments = [
        {
          name: 'personal-details',
          title: 'Personal Details',
          pageIds: ['ffefd409-f3f4-49fe-882e-6e89f44631b1']
        },
        {
          name: 'business-info',
          title: 'Business Information',
          pageIds: ['449a45f6-4541-4a46-91bd-8b8931b07b50']
        }
      ]

      /** @type {SectionAssignmentItem[]} */
      const expectedSections = [
        {
          id: 'c1a2b3c4-d5e6-f7a8-b9c0-d1e2f3a4b5c6',
          name: 'personal-details',
          title: 'Personal Details',
          pageIds: ['ffefd409-f3f4-49fe-882e-6e89f44631b1']
        },
        {
          id: 'd2b3c4d5-e6f7-a8b9-c0d1-e2f3a4b5c6d7',
          name: 'business-info',
          title: 'Business Information',
          pageIds: ['449a45f6-4541-4a46-91bd-8b8931b07b50']
        }
      ]

      const assignSectionsMock = jest.mocked(assignSectionsToForm).mockResolvedValue(expectedSections)

      const response = await server.inject({
        method: 'PUT',
        url: `/forms/${id}/definition/draft/sections`,
        payload: {
          sections: sectionAssignments,
          requestType: FormDefinitionRequestType.ASSIGN_SECTIONS
        },
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({
        id,
        sections: expectedSections,
        status: 'updated'
      })

      const [calledFormId, calledAssignments, calledAuthor, calledRequestType] = assignSectionsMock.mock.calls[0]
      expect(calledFormId).toBe(id)

      expect(calledAssignments).toEqual([
        expect.objectContaining({
          name: 'personal-details',
          title: 'Personal Details',
          pageIds: ['ffefd409-f3f4-49fe-882e-6e89f44631b1'],
          hideTitle: false
        }),
        expect.objectContaining({
          name: 'business-info',
          title: 'Business Information',
          pageIds: ['449a45f6-4541-4a46-91bd-8b8931b07b50'],
          hideTitle: false
        })
      ])

      expect(calledAuthor).toEqual(expectedAuthor)
      expect(calledRequestType).toBe(FormDefinitionRequestType.ASSIGN_SECTIONS)
    })

    test('Testing PUT /forms/{id}/definition/draft/sections with section id provided', async () => {
      const existingId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

      /** @type {SectionAssignmentItem[]} */
      const sectionAssignments = [
        {
          id: existingId,
          name: 'existing-section',
          title: 'Existing Section',
          pageIds: ['ffefd409-f3f4-49fe-882e-6e89f44631b1']
        }
      ]

      /** @type {SectionAssignmentItem[]} */
      const expectedSections = [
        {
          id: existingId,
          name: 'existing-section',
          title: 'Existing Section',
          pageIds: ['ffefd409-f3f4-49fe-882e-6e89f44631b1']
        }
      ]

      const assignSectionsMock = jest.mocked(assignSectionsToForm).mockResolvedValue(expectedSections)

      const response = await server.inject({
        method: 'PUT',
        url: `/forms/${id}/definition/draft/sections`,
        payload: {
          sections: sectionAssignments,
          requestType: FormDefinitionRequestType.CREATE_SECTION
        },
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.result).toEqual({
        id,
        sections: expectedSections,
        status: 'updated'
      })

      const [calledFormId, calledAssignments, calledAuthor, calledRequestType] = assignSectionsMock.mock.calls[0]
      expect(calledFormId).toBe(id)

      expect(calledAssignments).toEqual([
        {
          id: existingId,
          name: 'existing-section',
          title: 'Existing Section',
          pageIds: ['ffefd409-f3f4-49fe-882e-6e89f44631b1'],
          hideTitle: false
        }
      ])
      expect(calledAuthor).toEqual(expectedAuthor)
      expect(calledRequestType).toBe(FormDefinitionRequestType.CREATE_SECTION)
    })

    test('Testing PUT /forms/{id}/definition/draft/sections with empty sections array', async () => {
      /** @type {SectionAssignmentItem[]} */
      const expectedSections = []

      jest.mocked(assignSectionsToForm).mockResolvedValue(expectedSections)

      const response = await server.inject({
        method: 'PUT',
        url: `/forms/${id}/definition/draft/sections`,
        payload: {
          sections: [],
          requestType: FormDefinitionRequestType.DELETE_SECTION
        },
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({
        id,
        sections: expectedSections,
        status: 'updated'
      })
    })

    test('Testing PUT /forms/{id}/definition/draft/sections with hideTitle property', async () => {
      /** @type {SectionAssignmentItem[]} */
      const sectionAssignments = [
        {
          name: 'hidden-section',
          title: 'Hidden Section',
          hideTitle: true,
          pageIds: []
        }
      ]

      /** @type {SectionAssignmentItem[]} */
      const expectedSections = [
        {
          id: 'e3c4d5e6-f7a8-b9c0-d1e2-f3a4b5c6d7e8',
          name: 'hidden-section',
          title: 'Hidden Section',
          hideTitle: true,
          pageIds: []
        }
      ]

      jest.mocked(assignSectionsToForm).mockResolvedValue(expectedSections)

      const response = await server.inject({
        method: 'PUT',
        url: `/forms/${id}/definition/draft/sections`,
        payload: {
          sections: sectionAssignments,
          requestType: FormDefinitionRequestType.ASSIGN_SECTIONS
        },
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.result).toEqual({
        id,
        sections: expectedSections,
        status: 'updated'
      })
    })
  })

  describe('Error responses', () => {
    test('Testing PUT /forms/{id}/definition/draft/sections with missing sections key returns structured validation error', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: `/forms/${id}/definition/draft/sections`,
        payload: { requestType: FormDefinitionRequestType.ASSIGN_SECTIONS },
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'InvalidFormDefinitionError',
        message: '"sections" is required',
        statusCode: 400,
        cause: [
          {
            id: FormDefinitionError.Other,
            type: FormDefinitionErrorType.Type,
            message: '"sections" is required'
          }
        ]
      })
    })

    test('Testing PUT /forms/{id}/definition/draft/sections with missing requestType returns structured validation error', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: `/forms/${id}/definition/draft/sections`,
        payload: { sections: [] },
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'InvalidFormDefinitionError',
        message: '"requestType" is required',
        statusCode: 400,
        cause: [
          {
            id: FormDefinitionError.Other,
            type: FormDefinitionErrorType.Type,
            message: '"requestType" is required'
          }
        ]
      })
    })

    test('Testing PUT /forms/{id}/definition/draft/sections with invalid section name returns structured validation error', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: `/forms/${id}/definition/draft/sections`,
        payload: {
          sections: [
            {
              name: '',
              title: 'Valid Title',
              pageIds: []
            }
          ],
          requestType: FormDefinitionRequestType.CREATE_SECTION
        },
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'InvalidFormDefinitionError',
        statusCode: 400,
        cause: [
          {
            id: FormDefinitionError.Other,
            type: FormDefinitionErrorType.Type
          }
        ]
      })
    })

    test('Testing PUT /forms/{id}/definition/draft/sections with invalid pageId returns structured validation error', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: `/forms/${id}/definition/draft/sections`,
        payload: {
          sections: [
            {
              name: 'valid-name',
              title: 'Valid Title',
              pageIds: ['not-a-valid-uuid']
            }
          ],
          requestType: FormDefinitionRequestType.ASSIGN_SECTIONS
        },
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'InvalidFormDefinitionError',
        statusCode: 400,
        cause: [
          {
            id: FormDefinitionError.Other,
            type: FormDefinitionErrorType.Type
          }
        ]
      })
    })

    test('Testing PUT /forms/{id}/definition/draft/sections with missing section title returns structured validation error', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: `/forms/${id}/definition/draft/sections`,
        payload: {
          sections: [
            {
              name: 'valid-name',
              pageIds: []
            }
          ],
          requestType: FormDefinitionRequestType.CREATE_SECTION
        },
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'InvalidFormDefinitionError',
        message: '"sections[0].title" is required',
        statusCode: 400,
        cause: [
          {
            id: FormDefinitionError.Other,
            type: FormDefinitionErrorType.Type,
            message: '"sections[0].title" is required'
          }
        ]
      })
    })

    test('Testing PUT /forms/{id}/definition/draft/sections with missing pageIds returns structured validation error', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: `/forms/${id}/definition/draft/sections`,
        payload: {
          sections: [
            {
              name: 'valid-name',
              title: 'Valid Title'
            }
          ],
          requestType: FormDefinitionRequestType.CREATE_SECTION
        },
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'InvalidFormDefinitionError',
        message: '"sections[0].pageIds" is required',
        statusCode: 400,
        cause: [
          {
            id: FormDefinitionError.Other,
            type: FormDefinitionErrorType.Type,
            message: '"sections[0].pageIds" is required'
          }
        ]
      })
    })

    test('Testing PUT /forms/{id}/definition/draft/sections with invalid form id still returns standard Bad Request', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: `/forms/invalid-id/definition/draft/sections`,
        payload: {
          sections: [],
          requestType: FormDefinitionRequestType.DELETE_SECTION
        },
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)

      expect(response.result).toMatchObject({
        error: 'Bad Request',
        statusCode: 400,
        validation: { source: 'params' }
      })
    })

    test('Testing PUT /forms/{id}/definition/draft/sections with duplicate section id returns uniqueness validation error', async () => {
      const duplicateId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

      const response = await server.inject({
        method: 'PUT',
        url: `/forms/${id}/definition/draft/sections`,
        payload: {
          sections: [
            {
              id: duplicateId,
              title: 'Section One',
              pageIds: []
            },
            {
              id: duplicateId,
              title: 'Section Two',
              pageIds: []
            }
          ],
          requestType: FormDefinitionRequestType.CREATE_SECTION
        },
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'InvalidFormDefinitionError',
        message: '"sections[1]" contains a duplicate value',
        statusCode: 400,
        cause: [
          {
            id: FormDefinitionError.UniqueSectionId,
            type: FormDefinitionErrorType.Unique,
            message: '"sections[1]" contains a duplicate value',
            detail: { path: ['sections', 1], pos: 1, dupePos: 0 }
          }
        ]
      })
    })

    test('Testing PUT /forms/{id}/definition/draft/sections with duplicate section name returns uniqueness validation error', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: `/forms/${id}/definition/draft/sections`,
        payload: {
          sections: [
            {
              name: 'duplicate-name',
              title: 'Section One',
              pageIds: []
            },
            {
              name: 'duplicate-name',
              title: 'Section Two',
              pageIds: []
            }
          ],
          requestType: FormDefinitionRequestType.CREATE_SECTION
        },
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'InvalidFormDefinitionError',
        message: '"sections[1]" contains a duplicate value',
        statusCode: 400,
        cause: [
          {
            id: FormDefinitionError.UniqueSectionName,
            type: FormDefinitionErrorType.Unique,
            message: '"sections[1]" contains a duplicate value',
            detail: { path: ['sections', 1], pos: 1, dupePos: 0 }
          }
        ]
      })
    })

    test('Testing PUT /forms/{id}/definition/draft/sections with duplicate section title returns uniqueness validation error', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: `/forms/${id}/definition/draft/sections`,
        payload: {
          sections: [
            {
              title: 'Duplicate Title',
              pageIds: []
            },
            {
              title: 'Duplicate Title',
              pageIds: []
            }
          ],
          requestType: FormDefinitionRequestType.CREATE_SECTION
        },
        auth
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        error: 'InvalidFormDefinitionError',
        message: '"sections[1]" contains a duplicate value',
        statusCode: 400,
        cause: [
          {
            id: FormDefinitionError.UniqueSectionTitle,
            type: FormDefinitionErrorType.Unique,
            message: '"sections[1]" contains a duplicate value',
            detail: { path: ['sections', 1], pos: 1, dupePos: 0 }
          }
        ]
      })
    })
  })
})

/**
 * @import { Server } from '@hapi/hapi'
 * @import { FormMetadataAuthor, SectionAssignmentItem } from '@defra/forms-model'
 */
