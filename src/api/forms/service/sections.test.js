import { AuditEventMessageType, FormDefinitionRequestType } from '@defra/forms-model'
import Boom from '@hapi/boom'
import { pino } from 'pino'

import * as formDefinition from '~/src/api/forms/repositories/form-definition-repository.js'
import * as formMetadata from '~/src/api/forms/repositories/form-metadata-repository.js'
import { formMetadataDocument } from '~/src/api/forms/service/__stubs__/service.js'
import { mockFormVersionDocument } from '~/src/api/forms/service/__stubs__/versioning.js'
import { assignSectionsToForm } from '~/src/api/forms/service/sections.js'
import * as versioningService from '~/src/api/forms/service/versioning.js'
import { getAuthor } from '~/src/helpers/get-author.js'
import * as publishBase from '~/src/messaging/publish-base.js'
import { prepareDb } from '~/src/mongo.js'

jest.mock('~/src/helpers/get-author.js')
jest.mock('~/src/api/forms/repositories/form-definition-repository.js')
jest.mock('~/src/api/forms/repositories/form-metadata-repository.js')
jest.mock('~/src/api/forms/templates.js')
jest.mock('~/src/mongo.js')
jest.mock('~/src/api/forms/service/versioning.js')
jest.mock('~/src/messaging/publish-base.js')

jest.useFakeTimers().setSystemTime(new Date('2020-01-01'))

describe('sections', () => {
  const id = '661e4ca5039739ef2902b214'
  const defaultAuthor = getAuthor()

  const dbMetadataSpy = jest.spyOn(formMetadata, 'updateAudit')

  const expectMetadataUpdate = () => {
    expect(dbMetadataSpy).toHaveBeenCalled()
    const [formId, author] = dbMetadataSpy.mock.calls[0]
    expect(formId).toBe(id)
    expect(author).toEqual(defaultAuthor)
  }

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
      hideTitle: true,
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
      hideTitle: true,
      pageIds: ['449a45f6-4541-4a46-91bd-8b8931b07b50']
    }
  ]

  beforeAll(async () => {
    await prepareDb(pino())
  })

  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(formMetadata.get).mockResolvedValue(formMetadataDocument)
    jest.mocked(formMetadata.updateAudit).mockResolvedValue(formMetadataDocument)
    jest.mocked(versioningService.createFormVersion).mockResolvedValue(mockFormVersionDocument)
    jest.mocked(versioningService.getLatestFormVersion).mockResolvedValue(mockFormVersionDocument)
  })

  describe('assignSectionsToForm', () => {
    it('should assign sections to the form definition', async () => {
      const assignSectionsMock = jest.mocked(formDefinition.assignSections).mockResolvedValueOnce(expectedSections)
      const publishEventSpy = jest.spyOn(publishBase, 'publishEvent')

      const result = await assignSectionsToForm(
        id,
        sectionAssignments,
        defaultAuthor,
        FormDefinitionRequestType.ASSIGN_SECTIONS
      )

      // Verify repository was called with correct arguments
      const [formId, assignments] = assignSectionsMock.mock.calls[0]
      expect(formId).toBe(id)
      expect(assignments).toEqual(sectionAssignments)

      // Verify result
      expect(result).toEqual(expectedSections)

      // Verify metadata was updated
      expectMetadataUpdate()

      // Verify version was created
      expect(versioningService.createFormVersion).toHaveBeenCalledWith(id, expect.anything())

      // Verify audit event was published
      const [auditMessage] = publishEventSpy.mock.calls[0]
      expect(auditMessage).toMatchObject({
        type: AuditEventMessageType.FORM_UPDATED
      })
      expect(auditMessage.data).toMatchObject({
        requestType: FormDefinitionRequestType.ASSIGN_SECTIONS,
        payload: { sections: sectionAssignments }
      })
    })

    it('should assign empty sections array', async () => {
      const emptyAssignments = /** @type {SectionAssignmentItem[]} */ ([])
      const emptySections = /** @type {SectionAssignmentItem[]} */ ([])

      jest.mocked(formDefinition.assignSections).mockResolvedValueOnce(emptySections)
      const publishEventSpy = jest.spyOn(publishBase, 'publishEvent')

      const result = await assignSectionsToForm(
        id,
        emptyAssignments,
        defaultAuthor,
        FormDefinitionRequestType.UNASSIGN_SECTIONS
      )

      expect(result).toEqual(emptySections)
      expectMetadataUpdate()

      const [auditMessage] = publishEventSpy.mock.calls[0]
      expect(auditMessage.data).toMatchObject({
        requestType: FormDefinitionRequestType.UNASSIGN_SECTIONS,
        payload: { sections: emptyAssignments }
      })
    })

    it('should surface errors from repository', async () => {
      const boomNotFound = Boom.notFound('Form not found')
      jest.mocked(formDefinition.assignSections).mockRejectedValueOnce(boomNotFound)

      await expect(
        assignSectionsToForm(id, sectionAssignments, defaultAuthor, FormDefinitionRequestType.ASSIGN_SECTIONS)
      ).rejects.toThrow(boomNotFound)
    })

    it('should surface errors from metadata update', async () => {
      jest.mocked(formDefinition.assignSections).mockResolvedValueOnce(expectedSections)

      const boomInternal = Boom.internal('Database error')
      jest.mocked(formMetadata.updateAudit).mockRejectedValueOnce(boomInternal)

      await expect(
        assignSectionsToForm(id, sectionAssignments, defaultAuthor, FormDefinitionRequestType.ASSIGN_SECTIONS)
      ).rejects.toThrow(boomInternal)
    })

    it('should handle sections with hideTitle property', async () => {
      /** @type {SectionAssignmentItem[]} */
      const assignmentsWithHideTitle = [
        {
          name: 'hidden-section',
          title: 'Hidden Section',
          hideTitle: true,
          pageIds: []
        }
      ]

      /** @type {SectionAssignmentItem[]} */
      const expectedWithHideTitle = [
        {
          id: 'e3c4d5e6-f7a8-b9c0-d1e2-f3a4b5c6d7e8',
          name: 'hidden-section',
          title: 'Hidden Section',
          hideTitle: true,
          pageIds: []
        }
      ]

      jest.mocked(formDefinition.assignSections).mockResolvedValueOnce(expectedWithHideTitle)

      const result = await assignSectionsToForm(
        id,
        assignmentsWithHideTitle,
        defaultAuthor,
        FormDefinitionRequestType.ASSIGN_SECTIONS
      )

      expect(result).toEqual(expectedWithHideTitle)
    })

    it('should use CREATE_SECTION request type when adding a section', async () => {
      const assignSectionsMock = jest.mocked(formDefinition.assignSections).mockResolvedValueOnce(expectedSections)
      const publishEventSpy = jest.spyOn(publishBase, 'publishEvent')

      await assignSectionsToForm(id, sectionAssignments, defaultAuthor, FormDefinitionRequestType.CREATE_SECTION)

      expect(assignSectionsMock).toHaveBeenCalled()

      const [auditMessage] = publishEventSpy.mock.calls[0]
      expect(auditMessage.data).toMatchObject({
        requestType: FormDefinitionRequestType.CREATE_SECTION,
        payload: { sections: sectionAssignments }
      })
    })

    it('should use DELETE_SECTION request type when removing a section', async () => {
      const remainingSections = /** @type {SectionAssignmentItem[]} */ ([expectedSections[0]])

      jest.mocked(formDefinition.assignSections).mockResolvedValueOnce(remainingSections)
      const publishEventSpy = jest.spyOn(publishBase, 'publishEvent')

      await assignSectionsToForm(id, [sectionAssignments[0]], defaultAuthor, FormDefinitionRequestType.DELETE_SECTION)

      const [auditMessage] = publishEventSpy.mock.calls[0]
      expect(auditMessage.data).toMatchObject({
        requestType: FormDefinitionRequestType.DELETE_SECTION,
        payload: { sections: [sectionAssignments[0]] }
      })
    })
  })
})

/**
 * @import { SectionAssignmentItem } from '@defra/forms-model'
 */
