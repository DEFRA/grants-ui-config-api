import {
  AuditEventMessageType,
  ConditionType,
  Coordinator,
  FormDefinitionRequestType,
  OperatorName
} from '@defra/forms-model'
import { buildDefinition, buildQuestionPage, buildTextFieldComponent } from '@defra/forms-model/stubs'
import Boom from '@hapi/boom'
import { pino } from 'pino'

import { buildCondition } from '~/src/api/forms/__stubs__/definition.js'
import { InvalidFormDefinitionError } from '~/src/api/forms/errors.js'
import * as formDefinition from '~/src/api/forms/repositories/form-definition-repository.js'
import * as formMetadata from '~/src/api/forms/repositories/form-metadata-repository.js'
import { formMetadataDocument } from '~/src/api/forms/service/__stubs__/service.js'
import { mockFormVersionDocument } from '~/src/api/forms/service/__stubs__/versioning.js'
import {
  addConditionToDraftFormDefinition,
  removeConditionOnDraftFormDefinition,
  updateConditionOnDraftFormDefinition
} from '~/src/api/forms/service/conditions.js'
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

jest.mocked(formDefinition.updatePageFields).mockResolvedValue(buildDefinition({}))
jest.mocked(formDefinition.deleteCondition).mockResolvedValue(buildDefinition({}))

jest.useFakeTimers().setSystemTime(new Date('2020-01-01'))

describe('conditions', () => {
  const id = '661e4ca5039739ef2902b214'
  const page1Id = '87ffdbd3-9e43-41e2-8db3-98ade26ca0b7'
  const page2Id = 'e3a1cb1e-8c9e-41d7-8ba7-719829bce84a'
  const page3Id = 'f5a1cb1e-8c9e-41d7-8ba7-719829bce84b'
  const component1Id = 'e296d931-2364-4b17-9049-1aa1afea29d3'
  const component2Id = '81f513ba-210f-4532-976c-82f8fc7ec2b6'
  const condition1Id = '6e4c2f74-5bd9-48b4-b991-f2a021dcde59'
  const condition2Id = '91c10139-a0dd-46a4-a2c5-4d7a02fdf923'
  const joinedConditionId = 'a9fdbd20-df6c-42ef-b6ce-e72f7b76b069'
  const defaultAuthor = getAuthor()
  const dbMetadataSpy = jest.spyOn(formMetadata, 'updateAudit')

  const expectMetadataUpdate = () => {
    expect(dbMetadataSpy).toHaveBeenCalled()
    const [formId, author] = dbMetadataSpy.mock.calls[0]
    expect(formId).toBe(id)
    expect(author).toEqual(defaultAuthor)
  }

  const component1 = buildTextFieldComponent({
    id: component1Id
  })

  const page1 = buildQuestionPage({
    id: page1Id,
    title: 'Page One',
    path: '/page-one',
    components: [component1]
  })
  const component2 = buildTextFieldComponent({
    id: component2Id
  })
  const page2 = buildQuestionPage({
    id: page2Id,
    title: 'Page Two',
    path: '/page-two',
    components: [component2]
  })

  const condition1 = buildCondition({
    id: condition1Id,
    displayName: 'isEnriqueChase',
    items: [
      {
        id: '6746b15f-69f9-454c-a324-c62420069618',
        componentId: component1Id,
        operator: OperatorName.Is,
        type: ConditionType.StringValue,
        value: 'Enrique Chase'
      }
    ]
  })

  const condition2 = buildCondition({
    id: condition2Id,
    displayName: 'isJoanneBloggs',
    items: [
      {
        id: 'c73645b4-3ecf-4b00-bbee-de3bc465384d',
        componentId: component2Id,
        operator: OperatorName.Is,
        type: ConditionType.StringValue,
        value: 'Joanne Bloggs'
      }
    ]
  })

  const conditions = [condition1, condition2]

  const formDefinitionWithConditions = buildDefinition({
    pages: [page1, page2],
    conditions
  })

  const page3 = buildQuestionPage({
    id: page3Id,
    title: 'Page Three',
    path: '/page-three',
    components: [component1],
    condition: condition1Id
  })

  const joinedCondition = buildCondition({
    id: joinedConditionId,
    displayName: 'isEnriqueChaseOrJoanneBloggs',
    coordinator: Coordinator.OR,
    items: [
      {
        id: '38bc27cc-01b8-4bc7-8f4f-6fb7d70897d6',
        conditionId: condition1Id
      },
      {
        id: 'c84adc88-3f4e-4390-b22b-bdf60faf52be',
        conditionId: condition2Id
      }
    ]
  })

  beforeAll(async () => {
    await prepareDb(pino())
  })

  beforeEach(() => {
    jest.mocked(formMetadata.get).mockResolvedValue(formMetadataDocument)
    jest.mocked(formMetadata.updateAudit).mockResolvedValue(formMetadataDocument)
    jest.mocked(versioningService.createFormVersion).mockResolvedValue(mockFormVersionDocument)
    jest.mocked(versioningService.getLatestFormVersion).mockResolvedValue(mockFormVersionDocument)
  })

  describe('addConditionToDraftFormDefinition', () => {
    it('should add a condition to the form definition', async () => {
      jest.mocked(formDefinition.get).mockResolvedValueOnce(formDefinitionWithConditions)

      const expectedCondition = buildCondition({
        id: 'a9fdbd20-df6c-42ef-b6ce-e72f7b76b069',
        displayName: 'isJoanneBloggsChase',
        items: [
          {
            id: '6746b15f-69f9-454c-a324-c62420069618',
            componentId: component1Id,
            operator: OperatorName.Is,
            type: ConditionType.StringValue,
            value: 'Joanne Bloggs-Chase'
          }
        ]
      })

      const addConditionMock = jest.mocked(formDefinition.addCondition).mockResolvedValueOnce(expectedCondition)
      const publishEventSpy = jest.spyOn(publishBase, 'publishEvent')

      const result = await addConditionToDraftFormDefinition(id, expectedCondition, defaultAuthor)
      const [expectedFormId, conditionToInsert] = addConditionMock.mock.calls[0]
      expect(expectedFormId).toBe(id)
      expect(conditionToInsert).toEqual(expectedCondition)
      expect(result).toEqual(expectedCondition)
      expectMetadataUpdate()

      const [auditMessage] = publishEventSpy.mock.calls[0]
      expect(auditMessage).toMatchObject({
        type: AuditEventMessageType.FORM_UPDATED
      })
      expect(auditMessage.data).toMatchObject({
        requestType: FormDefinitionRequestType.CREATE_CONDITION,
        payload: expectedCondition
      })
    })
  })

  describe('updateConditionOnDraftFormDefinition', () => {
    it('should update a condition on the form definition', async () => {
      const conditionToUpdate = buildCondition({
        id: condition1Id,
        displayName: 'isNotEnriqueChase',
        items: [
          {
            id: '6746b15f-69f9-454c-a324-c62420069618',
            componentId: component1Id,
            operator: OperatorName.IsNot,
            type: ConditionType.StringValue,
            value: 'Enrique Chase'
          }
        ]
      })

      jest.mocked(formDefinition.get).mockResolvedValueOnce(formDefinitionWithConditions)

      const updateListMock = jest.mocked(formDefinition.updateCondition).mockResolvedValueOnce(conditionToUpdate)
      const publishEventSpy = jest.spyOn(publishBase, 'publishEvent')

      const result = await updateConditionOnDraftFormDefinition(id, condition1Id, conditionToUpdate, defaultAuthor)
      const [expectedFormId, expectedConditionId, expectedConditionToUpdate] = updateListMock.mock.calls[0]

      expect(expectedFormId).toBe(id)
      expect(expectedConditionId).toBe(condition1Id)
      expect(expectedConditionToUpdate).toEqual(conditionToUpdate)
      expect(result).toEqual(conditionToUpdate)
      expectMetadataUpdate()

      const [auditMessage] = publishEventSpy.mock.calls[0]
      expect(auditMessage).toMatchObject({
        type: AuditEventMessageType.FORM_UPDATED
      })
      expect(auditMessage.data).toMatchObject({
        requestType: FormDefinitionRequestType.UPDATE_CONDITION,
        payload: expectedConditionToUpdate
      })
    })
  })

  describe('removeConditionOnDraftFormDefinition', () => {
    beforeEach(() => {
      jest.clearAllMocks()
    })

    it('should remove a condition on the form definition', async () => {
      jest.mocked(formDefinition.get).mockResolvedValue(formDefinitionWithConditions)

      jest.mocked(formDefinition.deleteCondition).mockResolvedValue(buildDefinition())
      const publishEventSpy = jest.spyOn(publishBase, 'publishEvent')

      await removeConditionOnDraftFormDefinition(id, condition1Id, defaultAuthor)
      const [expectedFormId, expectedConditionId] = jest.mocked(formDefinition.deleteCondition).mock.calls[0]
      expect(expectedFormId).toBe(id)
      expect(expectedConditionId).toBe(condition1Id)
      expectMetadataUpdate()

      const [auditMessage] = publishEventSpy.mock.calls[0]
      expect(auditMessage).toMatchObject({
        type: AuditEventMessageType.FORM_UPDATED
      })
      expect(auditMessage.data).toMatchObject({
        requestType: FormDefinitionRequestType.DELETE_CONDITION,
        payload: { conditionId: expectedConditionId }
      })
    })

    it('should surface errors', async () => {
      const boomInternal = Boom.internal('Something went wrong')

      jest.mocked(formDefinition.get).mockResolvedValue(formDefinitionWithConditions)

      jest.mocked(formDefinition.deleteCondition).mockRejectedValueOnce(boomInternal)

      await expect(removeConditionOnDraftFormDefinition(id, condition1Id, defaultAuthor)).rejects.toThrow(boomInternal)
    })

    it('should unassign simple condition from page before deletion', async () => {
      const formWithPageCondition = buildDefinition({
        pages: [page1, page2, page3],
        conditions: [condition1, condition2]
      })

      jest.mocked(formDefinition.get).mockResolvedValue(formWithPageCondition)

      jest.mocked(formDefinition.deleteCondition).mockResolvedValue(buildDefinition())

      await removeConditionOnDraftFormDefinition(id, condition1Id, defaultAuthor)

      expect(formDefinition.deleteCondition).toHaveBeenCalledWith(id, condition1Id, expect.anything())

      expectMetadataUpdate()
    })

    it('should unassign simple condition from multiple pages before deletion', async () => {
      const page4 = buildQuestionPage({
        id: 'page4Id',
        title: 'Page Four',
        path: '/page-four',
        components: [component2],
        condition: condition1Id
      })

      const formWithMultiplePageConditions = buildDefinition({
        pages: [page1, page2, page3, page4],
        conditions: [condition1, condition2]
      })

      jest.mocked(formDefinition.get).mockResolvedValue(formWithMultiplePageConditions)

      jest.mocked(formDefinition.deleteCondition).mockResolvedValue(buildDefinition())

      await removeConditionOnDraftFormDefinition(id, condition1Id, defaultAuthor)

      expect(formDefinition.deleteCondition).toHaveBeenCalledTimes(1)
      expect(formDefinition.deleteCondition).toHaveBeenCalledWith(id, condition1Id, expect.anything())
    })

    it('should fail when condition is referenced by joined conditions', async () => {
      const mockValidationError = /** @type {ValidationError} */ ({
        name: 'ValidationError',
        message: '"conditions[2].items[0].conditionId" must be [ref:root:conditions]',
        isJoi: true,
        annotate: () => '',
        _original: {},
        details: [
          {
            message: '"conditions[2].items[0].conditionId" must be [ref:root:conditions]',
            path: ['conditions', 2, 'items', 0, 'conditionId'],
            type: 'any.ref',
            context: {
              ref: 'root:conditions',
              key: 'conditionId',
              label: 'conditions[2].items[0].conditionId'
            }
          }
        ]
      })

      jest.mocked(formDefinition.deleteCondition).mockRejectedValue(new InvalidFormDefinitionError(mockValidationError))

      await expect(removeConditionOnDraftFormDefinition(id, condition1Id, defaultAuthor)).rejects.toThrow(
        InvalidFormDefinitionError
      )

      expect(formDefinition.deleteCondition).toHaveBeenCalledWith(id, condition1Id, expect.anything())
    })

    it('should fail when condition is referenced by joined condition even if also assigned to pages', async () => {
      const mockValidationError = /** @type {ValidationError} */ ({
        name: 'ValidationError',
        message: '"conditions[2].items[0].conditionId" must be [ref:root:conditions]',
        isJoi: true,
        annotate: () => '',
        _original: {},
        details: [
          {
            message: '"conditions[2].items[0].conditionId" must be [ref:root:conditions]',
            path: ['conditions', 2, 'items', 0, 'conditionId'],
            type: 'any.ref',
            context: {
              ref: 'root:conditions',
              key: 'conditionId',
              label: 'conditions[2].items[0].conditionId'
            }
          }
        ]
      })

      jest.mocked(formDefinition.deleteCondition).mockRejectedValue(new InvalidFormDefinitionError(mockValidationError))

      await expect(removeConditionOnDraftFormDefinition(id, condition1Id, defaultAuthor)).rejects.toThrow(
        InvalidFormDefinitionError
      )

      expect(formDefinition.deleteCondition).toHaveBeenCalledWith(id, condition1Id, expect.anything())
    })

    it('should handle pages without ids gracefully', async () => {
      const pageWithoutId = buildQuestionPage({
        title: 'No ID Page',
        path: '/no-id',
        components: [component1],
        condition: condition1Id
      })
      delete pageWithoutId.id

      const formWithPageWithoutId = buildDefinition({
        pages: [page1, pageWithoutId, page3],
        conditions: [condition1, condition2]
      })

      jest.mocked(formDefinition.get).mockResolvedValue(formWithPageWithoutId)

      jest.mocked(formDefinition.deleteCondition).mockResolvedValue(buildDefinition())

      await removeConditionOnDraftFormDefinition(id, condition1Id, defaultAuthor)

      expect(formDefinition.deleteCondition).toHaveBeenCalledTimes(1)
    })

    it('should succeed when deleting joined condition (no other conditions reference it)', async () => {
      const formWithJoinedCondition = buildDefinition({
        pages: [page1, page2],
        conditions: [condition1, condition2, joinedCondition]
      })

      jest.mocked(formDefinition.get).mockResolvedValue(formWithJoinedCondition)

      jest.mocked(formDefinition.deleteCondition).mockResolvedValue(buildDefinition())

      await removeConditionOnDraftFormDefinition(id, joinedConditionId, defaultAuthor)

      expect(formDefinition.deleteCondition).toHaveBeenCalledWith(id, joinedConditionId, expect.anything())
    })
  })
})

/**
 * @import { ValidationError } from 'joi'
 */
