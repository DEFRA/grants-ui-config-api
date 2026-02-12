import {
  ConditionType,
  ControllerType,
  Coordinator,
  Engine,
  FormStatus,
  OperatorName,
  formDefinitionSchema,
  formDefinitionV2Schema,
  hasComponents,
  hasComponentsEvenIfNoNext
} from '@defra/forms-model'
import {
  buildDefinition,
  buildFileUploadComponent,
  buildList,
  buildListItem,
  buildQuestionPage,
  buildSummaryPage,
  buildTextFieldComponent
} from '@defra/forms-model/stubs'
import Boom from '@hapi/boom'
import { ObjectId } from 'mongodb'

import { buildCondition } from '~/src/api/forms/__stubs__/definition.js'
import { buildMockCollection } from '~/src/api/forms/__stubs__/mongo.js'
import * as formDefinition from '~/src/api/forms/repositories/form-definition-repository.js'
import {
  addComponent,
  addCondition,
  addList,
  addPage,
  assignSections,
  deleteComponent,
  deleteCondition,
  deleteDraft,
  deleteList,
  deletePage,
  deletePages,
  get,
  insert,
  reorderComponents,
  reorderPages,
  setEngineVersion,
  update,
  updateComponent,
  updateCondition,
  updateList,
  updateName,
  updateOption,
  updatePage,
  updatePageFields
} from '~/src/api/forms/repositories/form-definition-repository.js'
import { empty, emptyV2 } from '~/src/api/forms/templates.js'
import { getAuthor } from '~/src/helpers/get-author.js'
import { db } from '~/src/mongo.js'

const mockCollection = buildMockCollection()

jest.mock('~/src/helpers/get-author.js')

const author = getAuthor()
/**
 * @type {any}
 */
const mockSession = author
const formId = '1eabd1437567fe1b26708bbb'
const page1Id = '87ffdbd3-9e43-41e2-8db3-98ade26ca0b7'
const page2Id = 'e3a1cb1e-8c9e-41d7-8ba7-719829bce84a'
const page3Id = 'e789b259-ca15-4766-a8ef-a6fea5f7cbaa'
const page4Id = '8bb39623-0f81-4084-8de8-18ee3ad0021f'
const page5Id = '9d244215-6121-4316-bd7c-5abfc5083527'
const component1Id = 'e296d931-2364-4b17-9049-1aa1afea29d3'
const component2Id = '81f513ba-210f-4532-976c-82f8fc7ec2b6'
const component3Id = '6eab6ef1-7a37-486c-9929-1cedd01df40f'
const component4Id = 'a1bd1053-7100-497e-943c-0616358ca302'
const component5Id = '937dc5e1-c9dd-4231-8525-6135e9a69f75'
const component6Id = 'bc8ec4ac-6229-4c97-8553-66f11167b159'
const listId = 'eb68b22f-b6ba-4358-8cba-b61282fecdb1'
const condition1Id = '6e4c2f74-5bd9-48b4-b991-f2a021dcde59'
const condition2Id = '91c10139-a0dd-46a4-a2c5-4d7a02fdf923'

jest.mock('~/src/mongo.js', () => {
  let isPrepared = false
  const collection = /** @satisfies {Collection<{draft: FormDefinition}>} */ jest
    .fn()
    .mockImplementation(() => mockCollection)
  return {
    db: {
      collection
    },
    get client() {
      if (!isPrepared) {
        return undefined
      }

      return {
        startSession: () => ({
          endSession: jest.fn().mockResolvedValue(undefined),
          withTransaction: jest.fn(
            /**
             * Mock transaction handler
             * @param {() => Promise<void>} fn
             */
            async (fn) => fn()
          )
        })
      }
    },

    prepareDb() {
      isPrepared = true
      return Promise.resolve()
    }
  }
})

describe('form-definition-repository', () => {
  /** @type {FormDefinition} */
  let mockDefinition

  /** @type {FormDefinition} */
  let draft

  /** @type {Page} */
  let page1

  /** @type {Page} */
  let page2

  /** @type {Page} */
  let page3

  /** @type {Page} */
  let page4

  /** @type {Page} */
  let page5

  /** @type {Page} */
  let summaryPage

  /** @type {List[]} */
  let lists

  /** @type {ConditionWrapperV2[]} */
  let conditions

  beforeEach(() => {
    jest.mocked(db.collection).mockReturnValue(/** @type {any} */ (mockCollection))
    mockDefinition = buildDefinition({})
    const component1 = buildTextFieldComponent({
      id: component1Id
    })
    page1 = buildQuestionPage({
      id: page1Id,
      title: 'Page One',
      path: '/page-one',
      components: [component1]
    })
    const component2 = buildTextFieldComponent({
      id: component2Id
    })
    page2 = buildQuestionPage({
      id: page2Id,
      title: 'Page Two',
      path: '/page-two',
      components: [component2]
    })
    const component3 = buildTextFieldComponent({
      id: component3Id
    })
    page3 = buildQuestionPage({
      id: page3Id,
      title: 'Page Three',
      path: '/page-three',
      components: [component3]
    })
    const component4 = buildTextFieldComponent({
      id: component4Id
    })
    page4 = buildQuestionPage({
      id: page4Id,
      title: 'Page Four',
      path: '/page-four',
      components: [component4]
    })
    const component5 = buildTextFieldComponent({
      id: component5Id
    })
    const component6 = buildTextFieldComponent({
      id: component6Id,
      name: 'TextFieldTwo',
      title: 'Text field two'
    })
    page5 = buildQuestionPage({
      id: page5Id,
      title: 'Page Five',
      path: '/page-five',
      components: [component5, component6]
    })
    summaryPage = buildSummaryPage()

    const list = buildList({
      id: listId,
      items: []
    })

    lists = [list]

    const condition1 = buildCondition({
      id: condition1Id,
      displayName: 'isEnriqueChase',
      items: [
        {
          id: '6746b15f-69f9-454c-a324-c62420069618',
          componentId: component3Id,
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
          componentId: component4Id,
          operator: OperatorName.Is,
          type: ConditionType.StringValue,
          value: 'Joanne Bloggs'
        }
      ]
    })

    conditions = [condition1, condition2]

    draft = buildDefinition({
      pages: [page1, page2, page3, page4, page5, summaryPage],
      lists,
      conditions
    })
  })

  /**
   * The update callback method
   * @callback UpdateCallback
   */

  /**
   * The verify callback method
   * @callback VerifyCallback
   * @param {FormDefinition} definition
   */

  /**
   * Test helper
   * @param {UpdateCallback} callback
   * @param {VerifyCallback} verify
   */
  async function helper(callback, verify) {
    mockCollection.findOne.mockReturnValue({ draft })
    mockCollection.findOneAndUpdate.mockResolvedValue({ draft })

    await callback()

    const [filter] = mockCollection.findOne.mock.calls[0]
    expect(filter).toMatchObject({
      _id: new ObjectId(formId)
    })

    const [filter2, update] = mockCollection.findOneAndUpdate.mock.calls[0]
    expect(filter2).toMatchObject({
      _id: new ObjectId(formId)
    })
    expect(update).toMatchObject({
      $set: { draft: expect.any(Object) }
    })

    /** @type {UpdateFilter<{ draft: FormDefinition }>} */
    const updateFilter = update

    expect(updateFilter.$set?.draft).toBeDefined()

    if (!updateFilter.$set?.draft) {
      throw new Error('Unexpected empty draft on $set')
    }

    await verify(updateFilter.$set.draft)
  }

  describe('get', () => {
    beforeEach(() => {
      mockCollection.findOne.mockResolvedValue({
        draft: mockDefinition
      })
    })

    it('should handle a call outside of a session', async () => {
      const definition = await get(formId)
      const [filter, options] = mockCollection.findOne.mock.calls[0]

      expect(filter).toEqual({ _id: new ObjectId(formId) })
      expect(options).toEqual({ projection: { draft: 1 } })
      expect(definition).toEqual(mockDefinition)
    })

    it('should handle a call inside a session', async () => {
      await get(formId, FormStatus.Draft, mockSession)
      const [, options] = mockCollection.findOne.mock.calls[0]

      expect(options).toEqual({
        projection: { draft: 1 },
        session: mockSession
      })
    })

    it('should get live form definition', async () => {
      mockCollection.findOne.mockResolvedValue({
        live: mockDefinition
      })

      const definition = await get(formId, FormStatus.Live)
      const [filter, options] = mockCollection.findOne.mock.calls[0]

      expect(filter).toEqual({ _id: new ObjectId(formId) })
      expect(options).toEqual({ projection: { live: 1 } })
      expect(definition).toEqual(mockDefinition)
    })

    it('should throw Boom.notFound when form definition not found', async () => {
      mockCollection.findOne.mockResolvedValue(null)

      await expect(get(formId)).rejects.toThrow(Boom.notFound(`Form definition with ID '${formId}' not found`))
    })

    it('should throw Boom.notFound when state property is missing', async () => {
      mockCollection.findOne.mockResolvedValue({})

      await expect(get(formId, FormStatus.Draft)).rejects.toThrow(
        Boom.notFound(`Form definition with ID '${formId}' not found`)
      )
    })

    it('should throw Boom.internal for generic errors', async () => {
      const error = new Error('Database error')
      mockCollection.findOne.mockRejectedValue(error)

      await expect(get(formId)).rejects.toThrow(Boom.internal(error))
    })

    it('should rethrow Boom errors', async () => {
      const boomError = Boom.forbidden('Access denied')
      mockCollection.findOne.mockRejectedValue(boomError)

      await expect(get(formId)).rejects.toThrow(boomError)
    })

    it('should throw non-Error objects directly', async () => {
      const error = 'String error'
      mockCollection.findOne.mockRejectedValue(error)

      await expect(get(formId)).rejects.toBe(error)
    })
  })

  describe('deletePages', () => {
    it('should delete a page with predicate', async () => {
      await helper(
        async () => {
          await deletePages(formId, (page) => page.controller === ControllerType.Summary, mockSession)
        },
        (definition) => {
          expect(definition.pages).toHaveLength(5)
        }
      )
    })
  })

  describe('addPage', () => {
    const page = buildQuestionPage({
      id: '698b9a08-0853-4827-86e6-b900d59e03df',
      path: '/new-path'
    })

    it('should add a page at the correct position', async () => {
      await helper(
        async () => {
          await addPage(formId, page, mockSession)
        },
        (definition) => {
          expect(definition.pages).toHaveLength(7)
          expect(definition.pages.at(5)).toEqual(page)
        }
      )
    })
  })

  describe('updatePage', () => {
    it('should update a page', async () => {
      const newPage = buildQuestionPage({
        id: page1Id,
        title: 'New title',
        path: '/new-path',
        components: []
      })

      await helper(
        async () => {
          await updatePage(formId, page1Id, newPage, mockSession)
        },
        (definition) => {
          expect(definition.pages.at(0)).toEqual(newPage)
        }
      )
    })
  })

  describe('updateEngineVersion', () => {
    it('should update engine version to V1', async () => {
      await helper(
        async () => {
          await setEngineVersion(formId, Engine.V1, mockSession)
        },
        (definition) => {
          expect(definition.engine).toEqual(Engine.V1)
        }
      )
    })

    it('should update engine version to V2', async () => {
      await helper(
        async () => {
          await setEngineVersion(formId, Engine.V2, mockSession)
        },
        (definition) => {
          expect(definition.engine).toEqual(Engine.V2)
        }
      )
    })
  })

  describe('updateName', () => {
    it('should update name', async () => {
      await helper(
        async () => {
          await updateName(formId, 'New Name', mockSession, formDefinitionV2Schema)
        },
        (definition) => {
          expect(definition.name).toBe('New Name')
        }
      )
    })
  })

  describe('reorderPages', () => {
    it('should reorder pages', async () => {
      const order = [page2Id, page1Id]

      await helper(
        async () => {
          await reorderPages(formId, order, mockSession)
        },
        (definition) => {
          expect(definition.pages.at(0)).toEqual(page2)
          expect(definition.pages.at(1)).toEqual(page1)
        }
      )
    })
  })

  describe('reorderComponents', () => {
    it('should reorder components', async () => {
      const order = [component6Id, component5Id]

      await helper(
        async () => {
          await reorderComponents(formId, page5Id, order, mockSession)
        },
        (draftForReorderQuestions) => {
          const page = draftForReorderQuestions.pages[4]
          const components = hasComponents(page) ? page.components : []
          expect(components[0].id).toEqual(component6Id)
          expect(components[1].id).toEqual(component5Id)
        }
      )
    })
  })

  describe('addComponent', () => {
    const component = buildTextFieldComponent({
      id: 'e07916d1-5bab-499d-9ff9-d3c0df0f88eb',
      name: 'abcdef'
    })

    it('should add a component to a page', async () => {
      await helper(
        async () => {
          await addComponent(formId, page1Id, component, mockSession)
        },
        (definition) => {
          const page = definition.pages.at(0)
          expect(hasComponentsEvenIfNoNext(page) && page.components).toHaveLength(2)
          expect(hasComponentsEvenIfNoNext(page) && page.components.at(1)).toEqual(component)
        }
      )
    })

    it('should add a component to a page at position x', async () => {
      await helper(
        async () => {
          await addComponent(formId, page1Id, component, mockSession, 0)
        },
        (definition) => {
          const page = definition.pages.at(0)
          expect(hasComponentsEvenIfNoNext(page) && page.components).toHaveLength(2)
          expect(hasComponentsEvenIfNoNext(page) && page.components.at(0)).toEqual(component)
        }
      )
    })
  })

  describe('updateComponent', () => {
    const component = buildTextFieldComponent({
      id: component1Id
    })

    it('should update a component', async () => {
      /** @type {ComponentDef} */
      let savedComponent

      await helper(
        async () => {
          savedComponent = await updateComponent(formId, page1Id, component1Id, component, mockSession)
        },
        (definition) => {
          const expectedComponent = buildTextFieldComponent({
            ...component
          })
          const page = definition.pages.at(0)
          expect(savedComponent).toEqual(expectedComponent)

          expect(hasComponentsEvenIfNoNext(page) && page.components).toHaveLength(1)
        }
      )
    })

    it('should fail if the component is not found', async () => {
      mockCollection.findOne.mockResolvedValue(null)

      await expect(updateComponent(formId, page1Id, component1Id, component, mockSession)).rejects.toThrow(
        Boom.notFound("Document not found '1eabd1437567fe1b26708bbb'")
      )
    })
  })

  describe('updatePageFields', () => {
    it('should update a single page title', async () => {
      await helper(
        async () => {
          const pageFields = {
            title: 'Updated page title'
          }

          await updatePageFields(formId, page1Id, pageFields, mockSession)
        },
        (definition) => {
          const page = definition.pages.at(0)

          expect(page?.title).toBe('Updated page title')
        }
      )
    })

    it('should update a single page path', async () => {
      await helper(
        async () => {
          const pageFields = {
            path: '/updated-page-title'
          }

          await updatePageFields(formId, page1Id, pageFields, mockSession)
        },
        (definition) => {
          const page = definition.pages.at(0)

          expect(page?.path).toBe('/updated-page-title')
        }
      )
    })

    it('should update multiple page fields', async () => {
      await helper(
        async () => {
          const pageFields = {
            title: 'Updated page title',
            path: '/updated-page-title'
          }

          await updatePageFields(formId, page1Id, pageFields, mockSession)
        },
        (definition) => {
          const page = definition.pages.at(0)

          expect(page?.title).toBe('Updated page title')
          expect(page?.path).toBe('/updated-page-title')
        }
      )
    })

    it('should set controller', async () => {
      draft = buildDefinition({
        pages: [
          buildQuestionPage({
            ...page1,
            components: [buildFileUploadComponent()],
            controller: undefined
          }),
          page2,
          summaryPage
        ],
        lists
      })
      await helper(
        async () => {
          const pageFields = {
            title: 'Updated page title',
            controller: ControllerType.FileUpload
          }

          await updatePageFields(formId, page1Id, pageFields, mockSession)
        },
        (definition) => {
          const page = definition.pages.at(0)

          expect(page?.title).toBe('Updated page title')
          expect(page?.controller).toBe(ControllerType.FileUpload)
        }
      )
    })

    it('should unset controller', async () => {
      await helper(
        async () => {
          /** @satisfies {PatchPageFields} */
          const pageFields = {
            title: 'Updated page title',
            controller: null
          }

          await updatePageFields(formId, page1Id, pageFields, mockSession)
        },
        (definition) => {
          const page = definition.pages.at(0)

          expect(page?.title).toBe('Updated page title')
          expect(page?.controller).toBeUndefined()
        }
      )
    })
  })

  describe('deletePage', () => {
    it('should delete a page from a draft', async () => {
      await helper(
        async () => {
          await deletePage(formId, page1Id, mockSession)
        },
        (definition) => {
          expect(definition.pages).toHaveLength(5)
        }
      )
    })

    it('should fail if definition does not exist', async () => {
      mockCollection.findOneAndUpdate.mockResolvedValueOnce(null)

      await expect(deletePage(formId, page1Id, mockSession)).rejects.toThrow(
        Boom.notFound("Document not found '1eabd1437567fe1b26708bbb'")
      )
    })
  })

  describe('deleteComponent', () => {
    it('should delete a component', async () => {
      await helper(
        async () => {
          await deleteComponent(formId, page1Id, component1Id, mockSession)
        },
        (definition) => {
          const page = definition.pages.at(0)

          expect(hasComponentsEvenIfNoNext(page) && page.components).toHaveLength(0)
        }
      )
    })
  })

  describe('addList', () => {
    it('should add a list', async () => {
      const list = buildList({
        id: '05a1f94e-17ff-4407-b20e-bbc76b346b3c',
        title: 'New list',
        name: 'abcdef',
        items: []
      })

      await helper(
        async () => {
          await addList(formId, list, mockSession)
        },
        (definition) => {
          expect(definition.lists).toHaveLength(2)
        }
      )
    })
  })

  describe('updateList', () => {
    const list = buildList({
      id: listId,
      items: [buildListItem()]
    })

    it('should update a list', async () => {
      await helper(
        async () => {
          await updateList(formId, listId, list, mockSession)
        },
        (definition) => {
          expect(definition.lists).toHaveLength(1)
          expect(definition.lists.at(0)?.items).toHaveLength(1)
        }
      )
    })
  })

  describe('deleteList', () => {
    it('should delete a list', async () => {
      await helper(
        async () => {
          await deleteList(formId, listId, mockSession)
        },
        (definition) => {
          expect(definition.lists).toHaveLength(0)
        }
      )
    })
  })

  describe('addCondition', () => {
    it('should add a condition', async () => {
      const condition = buildCondition({
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

      await helper(
        async () => {
          await addCondition(formId, condition, mockSession)
        },
        (definition) => {
          expect(definition.conditions).toHaveLength(3)
        }
      )
    })

    it('should add a condition with reference', async () => {
      const condition = buildCondition({
        id: 'a9fdbd20-df6c-42ef-b6ce-e72f7b76b069',
        displayName: 'isEnriqueChaseOrJoanneBloggsChase',
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

      await helper(
        async () => {
          await addCondition(formId, condition, mockSession)
        },
        (definition) => {
          expect(definition.conditions).toHaveLength(3)
        }
      )
    })
  })

  describe('updateCondition', () => {
    const condition = buildCondition({
      id: condition1Id,
      displayName: 'isNotEnriqueChase',
      items: [
        {
          id: '6746b15f-69f9-454c-a324-c62420069618',
          componentId: component3Id,
          operator: OperatorName.IsNot,
          type: ConditionType.StringValue,
          value: 'Enrique Chase'
        }
      ]
    })

    it('should update a condition', async () => {
      await helper(
        async () => {
          await updateCondition(formId, condition1Id, condition, mockSession)
        },
        (definition) => {
          expect(definition.conditions).toHaveLength(2)
        }
      )
    })
  })

  describe('deleteCondition', () => {
    it('should delete a condition', async () => {
      await helper(
        async () => {
          await deleteCondition(formId, condition1Id, mockSession)
        },
        (definition) => {
          expect(definition.conditions).toHaveLength(1)
        }
      )
    })
  })

  describe('insert', () => {
    it('should insert a new draft definition', async () => {
      const definitionV1 = { ...draft, conditions: [] }
      mockCollection.findOneAndUpdate.mockResolvedValue({ definitionV1 })

      await insert(formId, definitionV1, mockSession, formDefinitionSchema)

      const [filter, update] = mockCollection.findOneAndUpdate.mock.calls[0]
      expect(filter).toMatchObject({
        _id: new ObjectId(formId)
      })
      expect(update).toMatchObject({
        $setOnInsert: { draft: expect.any(Object) }
      })

      /** @type {UpdateFilter<{ draft: FormDefinition }>} */
      const updateFilter = update

      expect(updateFilter.$setOnInsert?.draft).toBeDefined()

      if (!updateFilter.$setOnInsert?.draft) {
        throw new Error('Unexpected empty draft on $setOnInsert')
      }
    })
  })

  describe('update', () => {
    it('should update a V1 draft definition', async () => {
      const newDefinition = buildDefinition({
        ...empty()
      })

      await helper(
        async () => {
          await update(formId, newDefinition, mockSession, formDefinitionSchema)
        },
        (definition) => {
          expect(definition.pages).toHaveLength(1)
          expect(definition.lists).toHaveLength(0)
        }
      )
    })

    it('should update a V2 draft definition', async () => {
      const newV2Definition = emptyV2()

      await helper(
        async () => {
          await update(formId, newV2Definition, mockSession, formDefinitionV2Schema)
        },
        (definition) => {
          expect(definition.pages).toHaveLength(1)
          expect(definition.lists).toHaveLength(0)
        }
      )
    })
  })

  describe('createLiveFromDraft', () => {
    it('should copy draft to live', async () => {
      mockCollection.updateOne.mockResolvedValue({
        acknowledged: true,
        modifiedCount: 1
      })

      await formDefinition.createLiveFromDraft(formId, mockSession)

      const [filter, pipeline, options] = mockCollection.updateOne.mock.calls[0]

      expect(filter).toEqual({ _id: new ObjectId(formId) })
      expect(pipeline).toEqual([{ $set: { live: '$draft' } }])
      expect(options).toEqual({ session: mockSession })
    })
  })

  describe('createDraftFromLive', () => {
    it('should copy live to draft', async () => {
      mockCollection.updateOne.mockResolvedValue({
        acknowledged: true,
        modifiedCount: 1
      })

      await formDefinition.createDraftFromLive(formId, mockSession)

      const [filter, pipeline, options] = mockCollection.updateOne.mock.calls[0]

      expect(filter).toEqual({ _id: new ObjectId(formId) })
      expect(pipeline).toEqual([{ $set: { draft: '$live' } }])
      expect(options).toEqual({ session: mockSession })
    })

    it('should throw Boom.internal when mongodb error occurs', async () => {
      const mongoError = new Error('Database connection failed')
      mockCollection.updateOne.mockRejectedValue(mongoError)

      await expect(formDefinition.createDraftFromLive(formId, mockSession)).rejects.toThrow(Boom.internal(mongoError))
    })

    it('should rethrow Boom errors', async () => {
      const boomError = Boom.notFound('Form not found')
      mockCollection.updateOne.mockRejectedValue(boomError)

      await expect(formDefinition.createDraftFromLive(formId, mockSession)).rejects.toThrow(boomError)
    })
  })

  describe('remove', () => {
    it('should remove a form definition', async () => {
      mockCollection.deleteOne.mockResolvedValue({
        acknowledged: true,
        deletedCount: 1
      })

      await formDefinition.remove(formId, mockSession)

      const [filter, options] = mockCollection.deleteOne.mock.calls[0]

      expect(filter).toEqual({ _id: new ObjectId(formId) })
      expect(options).toEqual({ session: mockSession })
    })
  })

  describe('upsertDraftAndLive', () => {
    const document = {
      draft: buildDefinition(),
      live: buildDefinition()
    }

    it('should upsert a new document', async () => {
      mockCollection.updateOne.mockResolvedValue({
        upsertedCount: 1
      })

      const result = await formDefinition.upsertDraftAndLive(formId, document, mockSession)

      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { _id: new ObjectId(formId) },
        { $set: document },
        { session: mockSession, upsert: true }
      )
      expect(result).toHaveProperty('upsertedCount', 1)
    })

    it('should handle Boom errors', async () => {
      const error = Boom.badRequest('Boom error')
      mockCollection.updateOne.mockRejectedValue(error)

      await expect(formDefinition.upsertDraftAndLive(formId, document, mockSession)).rejects.toThrow(error)
    })

    it('should handle generic errors', async () => {
      const error = new Error('Generic error')
      mockCollection.updateOne.mockRejectedValue(error)

      await expect(formDefinition.upsertDraftAndLive(formId, document, mockSession)).rejects.toThrow(error)
    })
  })

  describe('assignSections', () => {
    it('should assign sections to pages', async () => {
      /** @type {SectionAssignmentItem[]} */
      const sectionAssignments = [
        {
          name: 'personal-details',
          title: 'Personal Details',
          pageIds: [page1Id]
        }
      ]

      await helper(
        async () => {
          await assignSections(formId, sectionAssignments, mockSession)
        },
        (definition) => {
          expect(definition.sections).toHaveLength(1)
          expect(definition.sections[0]).toMatchObject({
            id: expect.any(String),
            name: 'personal-details',
            title: 'Personal Details'
          })
          // Verify page section assignment
          const page = definition.pages.find((p) => p.id === page1Id)
          expect(page?.section).toBe(definition.sections[0].id)
        }
      )
    })
  })

  describe('deleteDraft', () => {
    const formId = '620653928dfe476a90b6a6f2'
    it('should throw if document not found', async () => {
      mockCollection.updateOne.mockReturnValueOnce({ matchedCount: 0 })
      await expect(deleteDraft(formId, mockSession)).rejects.toThrow("Document not found '620653928dfe476a90b6a6f2'")
    })

    it('should throw if draft not found', async () => {
      mockCollection.updateOne.mockReturnValueOnce({ modifiedCount: 0 })
      await expect(deleteDraft(formId, mockSession)).rejects.toThrow(
        "Draft not found in document '620653928dfe476a90b6a6f2'"
      )
    })

    it('should update successfully', async () => {
      mockCollection.updateOne.mockReturnValueOnce({ modifiedCount: 1 })
      expect(await deleteDraft(formId, mockSession)).toEqual({
        modifiedCount: 1
      })
    })
  })

  describe('updateOption', () => {
    it('should set option', async () => {
      await helper(
        async () => {
          await updateOption(formId, 'showReferenceNumber', 'true', mockSession)
        },
        (definition) => {
          expect(definition.options?.showReferenceNumber).toBe(true)
        }
      )
    })
  })
})

/**
 * @import { FormDefinition, PatchPageFields, Page, ComponentDef, List, ConditionWrapperV2, SectionAssignmentItem } from '@defra/forms-model'
 * @import { UpdateFilter } from 'mongodb'
 */
