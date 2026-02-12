import {
  ApiErrorCode,
  ConditionType,
  ControllerType,
  Engine,
  OperatorName,
  hasComponentsEvenIfNoNext,
  hasRepeater
} from '@defra/forms-model'
import { buildMarkdownComponent } from '@defra/forms-model/stubs'
import Boom from '@hapi/boom'
import { ObjectId } from 'mongodb'

import {
  buildCondition,
  buildDefinition,
  buildList,
  buildQuestionPage,
  buildStatusPage,
  buildSummaryPage,
  buildTextFieldComponent
} from '~/src/api/forms/__stubs__/definition.js'
import { buildMockCollection } from '~/src/api/forms/__stubs__/mongo.js'
import {
  buildSectionsResponse,
  findComponent,
  findConditionIndex,
  findListIndex,
  findPage,
  findPageIndex,
  getComponent,
  getCondition,
  getConditionIndex,
  getList,
  getListIndex,
  getPage,
  getPageIndex,
  getPageInsertPosition,
  handleControllerPatch,
  modifyAddComponent,
  modifyAddList,
  modifyAddPage,
  modifyAssignSections,
  modifyDeleteComponent,
  modifyDeleteList,
  modifyDeletePage,
  modifyDeletePages,
  modifyEngineVersion,
  modifyName,
  modifyReorderComponents,
  modifyReorderPages,
  modifyUnassignCondition,
  modifyUpdateComponent,
  modifyUpdateList,
  modifyUpdateOption,
  modifyUpdatePage,
  modifyUpdatePageFields,
  removeById,
  uniquePathGate
} from '~/src/api/forms/repositories/helpers.js'
import { empty as emptyFormWithSummary } from '~/src/api/forms/templates.js'
import { getAuthor } from '~/src/helpers/get-author.js'
import { db } from '~/src/mongo.js'

jest.mock('~/src/helpers/get-author.js')

const mockCollection = buildMockCollection()

const author = getAuthor()
/**
 * @type {any}
 */
const mockSession = author
const collectionId = '111bd1111222fe1b33333ccc'

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

describe('repository helpers', () => {
  const pageId = '0d174e6c-6131-4588-80bc-684238e13096'
  const summaryPageId = '449a45f6-4541-4a46-91bd-8b8931b07b50'
  const statusPageId = '38a2946b-78d9-4b94-9a31-4aa979ce2a89'
  const componentId = '62559680-e45e-4178-acdc-68f6b65d42bb'
  const listId = 'eb68b22f-b6ba-4358-8cba-b61282fecdb1'
  const conditionId = '6e4c2f74-5bd9-48b4-b991-f2a021dcde59'

  const component = buildTextFieldComponent({
    id: componentId
  })
  const summaryPage = buildSummaryPage()

  const questionPageWithComponent = buildQuestionPage({
    id: pageId,
    components: [component]
  })
  const questionPageWithoutComponent = buildQuestionPage({
    id: pageId
  })
  const summaryPageWithoutComponents = buildSummaryPage({
    id: summaryPageId
  })
  const statusPage = buildStatusPage({})

  const componentWithoutAnId = buildTextFieldComponent({
    name: 'Ghcbmw'
  })
  delete componentWithoutAnId.id

  const list = buildList({
    id: listId,
    items: []
  })

  const lists = [list]

  const condition = buildCondition({
    id: conditionId,
    displayName: 'isEnriqueChase',
    items: [
      {
        id: '6746b15f-69f9-454c-a324-c62420069618',
        componentId,
        operator: OperatorName.Is,
        type: ConditionType.StringValue,
        value: 'Enrique Chase'
      }
    ]
  })

  const conditions = [condition]

  describe('findPage', () => {
    it('should find page if page exists in definition', () => {
      const definition = buildDefinition({
        pages: [questionPageWithoutComponent, summaryPage]
      })
      expect(findPage(definition, pageId)).toEqual(questionPageWithoutComponent)
    })

    it('should return undefined if page is not found', () => {
      const definition = buildDefinition({
        pages: [summaryPageWithoutComponents]
      })
      expect(findPage(definition, 'incorrect-id')).toBeUndefined()
    })
  })

  describe('getPage', () => {
    it('should get page if page exists in definition', () => {
      const definition = buildDefinition({
        pages: [questionPageWithoutComponent, summaryPage]
      })
      expect(getPage(definition, pageId)).toEqual(questionPageWithoutComponent)
    })

    it('should throw Boom.notFound if page is not found', () => {
      const definition = buildDefinition({
        pages: [summaryPageWithoutComponents]
      })
      expect(() => {
        getPage(definition, 'incorrect-id')
      }).toThrow(Boom.notFound("Page not found with id 'incorrect-id'"))
    })
  })

  describe('findPageIndex', () => {
    it('should find page index if page exists in definition', () => {
      const definition = buildDefinition({
        pages: [questionPageWithoutComponent, summaryPage]
      })
      expect(findPageIndex(definition, pageId)).toBe(0)
    })

    it('should find summary page index if page exists in definition', () => {
      const definition = buildDefinition({
        pages: [questionPageWithoutComponent, summaryPage]
      })
      expect(findPageIndex(definition, summaryPageId)).toBe(1)
    })

    it('should return -1 if page is not found', () => {
      const definition = buildDefinition({
        pages: [summaryPageWithoutComponents]
      })
      expect(findPageIndex(definition, 'incorrect-id')).toBe(-1)
    })
  })

  describe('getPageIndex', () => {
    it('should find page index if page exists in definition', () => {
      const definition = buildDefinition({
        pages: [questionPageWithoutComponent, summaryPage]
      })
      expect(getPageIndex(definition, pageId)).toBe(0)
    })

    it('should find summary page index if page exists in definition', () => {
      const definition = buildDefinition({
        pages: [questionPageWithoutComponent, summaryPage]
      })
      expect(getPageIndex(definition, summaryPageId)).toBe(1)
    })

    it('should throw Boom.notFound if page is not found', () => {
      const definition = buildDefinition({
        pages: [summaryPageWithoutComponents]
      })
      expect(() => {
        getPageIndex(definition, 'incorrect-id')
      }).toThrow(Boom.notFound("Page not found with id 'incorrect-id'"))
    })
  })

  describe('getPageInsertPosition', () => {
    it('should return -1 if a summary page exists', () => {
      const definition = buildDefinition({
        pages: [questionPageWithoutComponent, summaryPage]
      })
      expect(getPageInsertPosition(definition)).toBe(-1)
    })

    it('should return undefined if a summary page does not exist', () => {
      const definition = buildDefinition({
        pages: [questionPageWithoutComponent]
      })
      expect(getPageInsertPosition(definition)).toBeUndefined()
    })
  })

  describe('findComponent', () => {
    it('should return undefined if page is not found', () => {
      const definition = buildDefinition({
        pages: [summaryPage]
      })
      expect(findComponent(definition, 'abc', 'def')).toBeUndefined()
    })

    it('should return undefined if page is a summary page', () => {
      const definition = buildDefinition({
        pages: [summaryPageWithoutComponents]
      })
      expect(findComponent(definition, summaryPageId, 'abc')).toBeUndefined()
    })

    it('should return undefined if page is a status page', () => {
      const definition = buildDefinition({
        pages: [statusPage]
      })
      expect(findComponent(definition, statusPageId, 'abc')).toBeUndefined()
    })

    it('should return component if component is found', () => {
      const definition = buildDefinition({
        pages: [questionPageWithComponent]
      })
      expect(findComponent(definition, pageId, componentId)).toEqual(component)
    })
  })

  describe('getComponent', () => {
    it('should throw Boom.notFound if page has no components', () => {
      const definition = buildDefinition({
        pages: [summaryPage]
      })
      expect(() => {
        getComponent(definition, summaryPageId, 'def')
      }).toThrow(Boom.notFound(`Component not found on page '${summaryPageId}' with id 'def' - page has no components`))
    })

    it('should throw Boom.notFound if component is not found', () => {
      const definition = buildDefinition({
        pages: [questionPageWithComponent]
      })
      expect(() => {
        getComponent(definition, pageId, 'def')
      }).toThrow(Boom.notFound(`Component not found on page '${pageId}' with id 'def'`))
    })

    it('should return component if component is found', () => {
      const definition = buildDefinition({
        pages: [questionPageWithComponent]
      })
      expect(getComponent(definition, pageId, componentId)).toEqual(component)
    })
  })

  describe('findListIndex', () => {
    it('should find list index if list exists in definition', () => {
      const definition = buildDefinition({
        pages: [],
        lists
      })
      expect(findListIndex(definition, listId)).toBe(0)
    })

    it('should return -1 if list is not found', () => {
      const definition = buildDefinition({
        pages: [summaryPageWithoutComponents]
      })
      expect(findListIndex(definition, 'incorrect-id')).toBe(-1)
    })
  })

  describe('getListIndex', () => {
    it('should find list index if list exists in definition', () => {
      const definition = buildDefinition({
        pages: [],
        lists
      })
      expect(getListIndex(definition, listId)).toBe(0)
    })

    it('should throw Boom.notFound if list is not found', () => {
      const definition = buildDefinition({
        pages: [],
        lists
      })
      expect(() => {
        getListIndex(definition, 'incorrect-id')
      }).toThrow(Boom.notFound("List not found with id 'incorrect-id'"))
    })
  })

  describe('getList', () => {
    it('should find list if list exists in definition', () => {
      const definition = buildDefinition({
        pages: [],
        lists
      })
      expect(getList(definition, listId)).toEqual(list)
    })

    it('should throw Boom.notFound if list is not found', () => {
      const definition = buildDefinition({
        pages: [],
        lists
      })
      expect(() => {
        getList(definition, 'incorrect-id')
      }).toThrow(Boom.notFound("List not found with id 'incorrect-id'"))
    })
  })

  describe('findConditionIndex', () => {
    it('should find condition index if condition exists in definition', () => {
      const definition = buildDefinition({
        pages: [],
        conditions
      })
      expect(findConditionIndex(definition, conditionId)).toBe(0)
    })

    it('should return -1 if condition is not found', () => {
      const definition = buildDefinition({
        pages: [summaryPageWithoutComponents]
      })
      expect(findConditionIndex(definition, 'incorrect-id')).toBe(-1)
    })
  })

  describe('getConditionIndex', () => {
    it('should find condition index if condition exists in definition', () => {
      const definition = buildDefinition({
        pages: [],
        conditions
      })
      expect(getConditionIndex(definition, conditionId)).toBe(0)
    })

    it('should throw Boom.notFound if condition is not found', () => {
      const definition = buildDefinition({
        pages: [],
        conditions
      })
      expect(() => {
        getConditionIndex(definition, 'incorrect-id')
      }).toThrow(Boom.notFound("Condition not found with id 'incorrect-id'"))
    })
  })

  describe('getCondition', () => {
    it('should find condition if condition exists in definition', () => {
      const definition = buildDefinition({
        pages: [],
        conditions
      })
      expect(getCondition(definition, conditionId)).toEqual(condition)
    })

    it('should throw Boom.notFound if condition is not found', () => {
      const definition = buildDefinition({
        pages: [],
        conditions
      })
      expect(() => {
        getCondition(definition, 'incorrect-id')
      }).toThrow(Boom.notFound("Condition not found with id 'incorrect-id'"))
    })
  })

  describe('removeById', () => {
    beforeEach(() => {
      jest.mocked(db.collection).mockReturnValue(/** @type {any} */ (mockCollection))
    })

    it('should remove', async () => {
      mockCollection.deleteOne.mockResolvedValue({ deletedCount: 1 })
      await removeById(mockSession, 'my-collection', collectionId)
      const [filter] = mockCollection.deleteOne.mock.calls[0]
      expect(filter).toEqual({
        _id: new ObjectId(collectionId)
      })
    })

    it('should throw if not deleted', async () => {
      mockCollection.deleteOne.mockResolvedValue({ deletedCount: 0 })
      await expect(removeById(mockSession, 'my-collection', collectionId)).rejects.toThrow(
        "Failed to delete id '111bd1111222fe1b33333ccc' from 'my-collection'. Expected deleted count of 1, received 0"
      )
    })
  })

  describe('uniquePathGate', () => {
    it('should throw if not unique', () => {
      const definition = emptyFormWithSummary()
      const pageOne = buildQuestionPage({
        id: 'p1',
        path: '/page-one'
      })
      const pageTwo = buildQuestionPage({
        id: 'p2',
        path: '/page-two'
      })
      const definition1 = buildDefinition({
        ...definition,
        pages: [pageOne, pageTwo]
      })
      expect(() => {
        uniquePathGate(definition1, '/page-one', 'Duplicate page path found')
      }).toThrow('Duplicate page path found')
    })

    it('should not throw if unique', () => {
      const definition = emptyFormWithSummary()
      const pageOne = buildQuestionPage({
        id: 'p1',
        path: '/page-one'
      })
      const pageTwo = buildQuestionPage({
        id: 'p2',
        path: '/page-two'
      })
      const definition1 = buildDefinition({
        ...definition,
        pages: [pageOne, pageTwo]
      })
      expect(() => {
        uniquePathGate(definition1, '/page-three', 'Duplicate page path found')
      }).not.toThrow()
    })

    it('should not throw if unique, despite updating current page to same as existing path', () => {
      const definition = emptyFormWithSummary()
      const pageOne = buildQuestionPage({
        id: 'p1',
        path: '/page-one'
      })
      const pageTwo = buildQuestionPage({
        id: 'p2',
        path: '/page-two'
      })
      const definition1 = buildDefinition({
        ...definition,
        pages: [pageOne, pageTwo]
      })
      expect(() => {
        uniquePathGate(definition1, '/page-two', 'Duplicate page path found', ApiErrorCode.DuplicatePagePathPage, 'p2')
      }).not.toThrow()
    })
  })

  describe('modifyEngineVersion', () => {
    it('should update the engine version to V1', () => {
      const definition = emptyFormWithSummary()
      expect(definition.engine).toBeUndefined()

      const modified = modifyEngineVersion(definition, Engine.V1)

      expect(modified.engine).toBe(Engine.V1)
    })

    it('should update the engine version to V2', () => {
      const definition = emptyFormWithSummary()
      expect(definition.engine).toBeUndefined()

      const modified = modifyEngineVersion(definition, Engine.V2)

      expect(modified.engine).toBe(Engine.V2)
    })
  })

  describe('modifyName', () => {
    it('should update the name', () => {
      const definition = emptyFormWithSummary()

      expect(definition.name).toBe('')

      const modified = modifyName(definition, 'New name')

      expect(modified.name).toBe('New name')
    })
  })

  describe('modifyRemoveMatchingPages', () => {
    it('should remove the summary page', () => {
      const definition = buildDefinition({
        pages: [questionPageWithComponent, questionPageWithoutComponent, summaryPage]
      })

      const modified = modifyDeletePages(definition, (page) => page.controller === ControllerType.Summary)

      expect(modified.pages).toHaveLength(2)
      expect(modified.pages).toEqual([questionPageWithComponent, questionPageWithoutComponent])
    })
  })

  describe('modifyAddPage', () => {
    it('should add summary at the end', () => {
      const definition = buildDefinition({
        pages: [questionPageWithComponent, questionPageWithoutComponent]
      })

      const modified = modifyAddPage(definition, summaryPage)

      expect(modified.pages).toHaveLength(3)
      expect(modified.pages.at(2)).toBe(summaryPage)
    })

    it('should add question page to position 1', () => {
      const definition = buildDefinition({
        pages: [questionPageWithComponent, summaryPage]
      })

      const modified = modifyAddPage(definition, questionPageWithoutComponent, 1)

      expect(modified.pages).toHaveLength(3)
      expect(modified.pages.at(1)).toBe(questionPageWithoutComponent)
    })

    it('should add summary at position -1', () => {
      const definition = buildDefinition({
        pages: [questionPageWithComponent, questionPageWithoutComponent]
      })

      const modified = modifyAddPage(definition, summaryPage, -1)

      expect(modified.pages).toHaveLength(3)
      expect(modified.pages.at(1)).toBe(summaryPage)
    })
  })

  describe('modifyUpdatePage', () => {
    it('should update the question page', () => {
      const definition = buildDefinition({
        pages: [questionPageWithComponent, summaryPage]
      })

      const modified = modifyUpdatePage(definition, questionPageWithoutComponent, pageId)

      expect(modified.pages.at(0)).toEqual(questionPageWithoutComponent)
    })
  })

  describe('modifyReorderPages', () => {
    it('should update the page order', () => {
      const definition = buildDefinition({
        pages: [questionPageWithComponent, summaryPage, statusPage]
      })

      const modified = modifyReorderPages(definition, [statusPageId, summaryPageId, pageId])

      expect(modified.pages.at(0)?.id).toEqual(statusPageId)
      expect(modified.pages.at(1)?.id).toEqual(summaryPageId)
      expect(modified.pages.at(2)?.id).toEqual(pageId)
    })

    it('should put unordered pages to the end order', () => {
      const definition = buildDefinition({
        pages: [questionPageWithComponent, summaryPage, statusPage]
      })

      const modified = modifyReorderPages(definition, [statusPageId, pageId])

      expect(modified.pages.at(0)?.id).toEqual(statusPageId)
      expect(modified.pages.at(1)?.id).toEqual(pageId)
      expect(modified.pages.at(2)?.id).toEqual(summaryPageId)
    })
  })

  describe('modifyReorderComponentss', () => {
    const componentId1 = 'fadeb416-2869-48b5-9292-ba45c01da52c'
    const componentId2 = 'd7981cfe-ea1d-49fe-9303-dc4465d3a776'
    const componentId3 = '57b5bd21-521d-467e-ab8a-1cd13eec984d'
    const componentId4 = '559673bc-c105-400d-b417-0e2a6e765e10'

    const component1 = buildTextFieldComponent({
      id: componentId1
    })
    const component2 = buildTextFieldComponent({
      id: componentId2
    })
    const component3 = buildTextFieldComponent({
      id: componentId3
    })
    const component4 = buildTextFieldComponent({
      id: componentId4
    })

    const questionPageWithComponents = buildQuestionPage({
      id: pageId,
      components: [component1, component2, component3, component4]
    })

    const definition = buildDefinition({
      pages: [questionPageWithComponents, summaryPage]
    })

    it('should update the questions order', () => {
      const modified = modifyReorderComponents(definition, pageId, [
        componentId4,
        componentId2,
        componentId1,
        componentId3
      ])

      const modifiedPage = modified.pages[0]
      const modifiedComponents =
        'components' in modifiedPage && modifiedPage.components?.length ? modifiedPage.components : []
      expect(modifiedComponents).toHaveLength(4)
      expect(modifiedComponents[0].id).toEqual(componentId4)
      expect(modifiedComponents[1].id).toEqual(componentId2)
      expect(modifiedComponents[2].id).toEqual(componentId1)
      expect(modifiedComponents[3].id).toEqual(componentId3)
    })

    it('should handle no components', () => {
      const questionPageWithNoComponents = buildQuestionPage({
        id: pageId,
        components: undefined
      })

      const definition = buildDefinition({
        pages: [questionPageWithNoComponents, summaryPage, statusPage]
      })

      const modified = modifyReorderComponents(definition, pageId, [
        componentId4,
        componentId2,
        componentId1,
        componentId3
      ])

      expect(modified).toEqual(definition)
    })

    it('should throw if page no found', () => {
      const definition = buildDefinition({
        pages: [summaryPage, statusPage]
      })

      expect(() => {
        modifyReorderComponents(definition, pageId, [componentId4, componentId2, componentId1, componentId3])
      }).toThrow(Boom.notFound(`Page not found with id '${pageId}'`))
    })
  })

  describe('modifyAddComponent', () => {
    it('should add the component to the page at the corrent position', () => {
      const definition = buildDefinition({
        pages: [questionPageWithComponent]
      })

      const newComponent = buildTextFieldComponent({
        name: 'abcdef'
      })
      const modified = modifyAddComponent(definition, pageId, newComponent, 0)

      const page = modified.pages.at(0)
      expect(hasComponentsEvenIfNoNext(page)).toBe(true)
      expect(hasComponentsEvenIfNoNext(page) && page.components).toHaveLength(2)
      expect(hasComponentsEvenIfNoNext(page) && page.components.at(0)).toBe(newComponent)
    })

    it('should add the component to the page at end', () => {
      const definition = buildDefinition({
        pages: [questionPageWithComponent]
      })

      const newComponent = buildTextFieldComponent({
        name: 'abcdef'
      })
      const modified = modifyAddComponent(definition, pageId, newComponent)

      const page = modified.pages.at(0)
      expect(hasComponentsEvenIfNoNext(page)).toBe(true)
      expect(hasComponentsEvenIfNoNext(page) && page.components).toHaveLength(2)
      expect(hasComponentsEvenIfNoNext(page) && page.components.at(1)).toBe(newComponent)
    })
    it('should add the component if summary page and components property doesnt yet exist', () => {
      const definition = buildDefinition({
        pages: [summaryPage]
      })

      const newComponent = buildTextFieldComponent({
        name: 'abcdef'
      })
      const modified = modifyAddComponent(definition, summaryPage.id ?? '', newComponent, 0)

      const page = modified.pages.at(0)
      expect(hasComponentsEvenIfNoNext(page)).toBe(true)
      expect(hasComponentsEvenIfNoNext(page) && page.components).toHaveLength(1)
      expect(hasComponentsEvenIfNoNext(page) && page.components.at(0)).toBe(newComponent)
    })
  })

  describe('modifyUpdateComponent', () => {
    it('should update the component by id', () => {
      const definition = buildDefinition({
        pages: [questionPageWithComponent]
      })

      const updatedComponent = buildTextFieldComponent({
        name: 'abcdef'
      })
      const modified = modifyUpdateComponent(definition, pageId, componentId, updatedComponent)

      const page = modified.pages.at(0)
      expect(hasComponentsEvenIfNoNext(page)).toBe(true)
      expect(hasComponentsEvenIfNoNext(page) && page.components.length).toBe(1)
      expect(hasComponentsEvenIfNoNext(page) && page.components.at(0)).toBe(updatedComponent)
    })
  })

  describe('modifyDeleteComponent', () => {
    it('should delete the component by id', () => {
      const definition = buildDefinition({
        pages: [questionPageWithComponent]
      })

      const modified = modifyDeleteComponent(definition, pageId, componentId)

      const page = modified.pages.at(0)
      expect(hasComponentsEvenIfNoNext(page)).toBe(true)
      expect(hasComponentsEvenIfNoNext(page) && page.components.length).toBe(0)
    })
  })

  describe('modifyUpdatePageFields', () => {
    it('should update the page title by id', () => {
      const definition = buildDefinition({
        pages: [questionPageWithComponent]
      })

      const modified = modifyUpdatePageFields(definition, pageId, {
        title: 'New title'
      })

      const page = modified.pages.at(0)
      expect(page?.title).toBe('New title')
    })

    it('should clear the page title by id', () => {
      const definition = buildDefinition({
        pages: [questionPageWithComponent]
      })

      const modified = modifyUpdatePageFields(definition, pageId, {
        title: ''
      })

      const page = modified.pages.at(0)
      expect(page?.title).toBe('')
    })

    it('should update the page path by id', () => {
      const definition = buildDefinition({
        pages: [questionPageWithComponent]
      })

      const modified = modifyUpdatePageFields(definition, pageId, {
        path: '/new-path'
      })

      const page = modified.pages.at(0)
      expect(page?.path).toBe('/new-path')
    })

    it('should update the page controller by id', () => {
      const definition = buildDefinition({
        pages: [questionPageWithComponent]
      })

      const modified = modifyUpdatePageFields(definition, pageId, {
        controller: ControllerType.Terminal
      })

      const page = modified.pages.at(0)
      expect(page?.controller).toBe(ControllerType.Terminal)
    })

    it('should clear the page controller by id', () => {
      const definition = buildDefinition({
        pages: [questionPageWithComponent]
      })

      const modified = modifyUpdatePageFields(definition, pageId, {
        controller: null
      })

      const page = modified.pages.at(0)
      expect(page?.controller).toBeUndefined()
    })

    it('should update the page repeat info by id', () => {
      const definition = buildDefinition({
        pages: [questionPageWithComponent]
      })

      const repeat = {
        options: { name: 'abcdef', title: 'Pizza' },
        schema: { min: 2, max: 5 }
      }

      const modified = modifyUpdatePageFields(definition, pageId, {
        controller: ControllerType.Repeat,
        repeat
      })

      const page = modified.pages.at(0)
      expect(page?.controller).toBe(ControllerType.Repeat)
      expect(hasRepeater(page) && page.repeat).toBe(repeat)
    })

    it('should update the page condition by id', () => {
      const definition = buildDefinition({
        pages: [questionPageWithComponent]
      })

      const modified = modifyUpdatePageFields(definition, pageId, {
        condition: 'd5e9f931-e151-4dd6-a2b9-68a03f3537e2'
      })

      const page = modified.pages.at(0)
      expect(page?.condition).toBe('d5e9f931-e151-4dd6-a2b9-68a03f3537e2')
    })

    it('should clear the page condition by id when set to null', () => {
      const pageWithCondition = {
        ...questionPageWithComponent,
        condition: 'existing-condition'
      }

      const definition = buildDefinition({
        pages: [pageWithCondition]
      })

      const modified = modifyUpdatePageFields(definition, pageId, {
        condition: null
      })

      const page = modified.pages.at(0)
      expect(page?.condition).toBeUndefined()
    })

    it('should not modify condition when undefined', () => {
      const pageWithCondition = {
        ...questionPageWithComponent,
        condition: 'existing-condition'
      }

      const definition = buildDefinition({
        pages: [pageWithCondition]
      })

      const modified = modifyUpdatePageFields(definition, pageId, {
        title: 'New title'
        // condition intentionally not provided (undefined)
      })

      const page = modified.pages.at(0)
      expect(page?.condition).toBe('existing-condition')
      expect(page?.title).toBe('New title')
    })
  })

  describe('modifyDeletePage', () => {
    it('should delete the page by id', () => {
      const definition = buildDefinition({
        pages: [questionPageWithComponent]
      })

      const modified = modifyDeletePage(definition, pageId)

      expect(modified.pages).toHaveLength(0)
    })
  })

  describe('modifyAddList', () => {
    it('should add a new list', () => {
      const definition = buildDefinition({
        pages: [questionPageWithComponent]
      })

      const modified = modifyAddList(definition, list)

      expect(modified.lists).toHaveLength(1)
      expect(modified.lists.at(0)).toBe(list)
    })
  })

  describe('modifyUpdateList', () => {
    it('should update a list by id', () => {
      const definition = buildDefinition({
        pages: [],
        lists
      })
      const newList = buildList({
        id: 'f4e4afc8-e972-40c3-9e1b-61a3dfd6d2aa',
        items: []
      })
      const modified = modifyUpdateList(definition, listId, newList)

      expect(modified.lists).toHaveLength(1)
      expect(modified.lists.at(0)).toBe(newList)
    })
  })

  describe('modifyRemoveList', () => {
    it('should remove a list by id', () => {
      const definition = buildDefinition({
        pages: [],
        lists
      })
      const modified = modifyDeleteList(definition, listId)

      expect(modified.lists).toHaveLength(0)
    })
  })

  describe('modifyUnassignCondition', () => {
    it('should unassign condition from pages that reference it', () => {
      const pageWithCondition = buildQuestionPage({
        id: 'page-with-condition',
        condition: conditionId
      })
      const pageWithDifferentCondition = buildQuestionPage({
        id: 'page-with-different-condition',
        condition: 'different-condition-id'
      })
      const pageWithoutCondition = buildQuestionPage({
        id: 'page-without-condition'
      })

      const definition = buildDefinition({
        pages: [pageWithCondition, pageWithDifferentCondition, pageWithoutCondition],
        conditions
      })

      const modified = modifyUnassignCondition(definition, conditionId)

      expect(modified.pages[0].condition).toBeUndefined()
      expect(modified.pages[1].condition).toBe('different-condition-id')
      expect(modified.pages[2].condition).toBeUndefined()
    })

    it('should handle pages without IDs gracefully', () => {
      const pageWithoutId = buildQuestionPage({
        title: 'Page without ID',
        condition: conditionId
      })
      delete pageWithoutId.id

      const definition = buildDefinition({
        pages: [pageWithoutId],
        conditions
      })

      const modified = modifyUnassignCondition(definition, conditionId)

      expect(modified.pages[0].condition).toBeUndefined()
    })

    it('should return the modified definition', () => {
      const definition = buildDefinition({
        pages: [questionPageWithComponent],
        conditions
      })

      const result = modifyUnassignCondition(definition, conditionId)

      expect(result).toBe(definition)
    })
  })

  describe('handleControllerPatch', () => {
    it('should unassign controller if passed as null', () => {
      const page = buildQuestionPage({
        title: 'Page title',
        controller: ControllerType.Page
      })
      const controller = null

      handleControllerPatch(page, controller)

      expect(page).toEqual({
        id: expect.any(String),
        components: [],
        title: 'Page title',
        path: '/page-one',
        next: []
      })
    })

    it('should assign controller', () => {
      const page = buildQuestionPage({
        title: 'Page title',
        controller: ControllerType.Page
      })
      const controller = ControllerType.Repeat

      handleControllerPatch(page, controller)

      expect(page).toEqual({
        id: expect.any(String),
        controller: 'RepeatPageController',
        components: [],
        title: 'Page title',
        path: '/page-one',
        next: []
      })
    })

    it('should assign FileUpload controller when no components', () => {
      const page = buildQuestionPage({
        title: 'Page title',
        controller: ControllerType.Page
      })
      const controller = ControllerType.FileUpload

      handleControllerPatch(page, controller)

      expect(page).toEqual({
        id: expect.any(String),
        controller: 'FileUploadPageController',
        components: [],
        title: 'Page title',
        path: '/page-one',
        next: []
      })
    })

    it('should assign FileUpload controller when one component', () => {
      const page = buildQuestionPage({
        title: 'Page title',
        controller: ControllerType.Page,
        components: [buildTextFieldComponent()]
      })
      const controller = ControllerType.FileUpload

      handleControllerPatch(page, controller)

      expect(page).toEqual({
        id: expect.any(String),
        controller: 'FileUploadPageController',
        components: [
          {
            hint: '',
            id: expect.any(String),
            name: 'TextField',
            options: {},
            schema: {},
            shortDescription: 'Text field',
            title: 'Text field',
            type: 'FileUploadField'
          }
        ],
        title: 'Page title',
        path: '/page-one',
        next: []
      })
    })

    it('should assign FileUpload controller when guidance component', () => {
      const page = buildQuestionPage({
        title: 'Page title',
        controller: ControllerType.Page,
        components: [buildMarkdownComponent({ content: 'Some markdown text' }), buildTextFieldComponent()]
      })
      const controller = ControllerType.FileUpload

      handleControllerPatch(page, controller)

      expect(page).toEqual({
        id: expect.any(String),
        controller: 'FileUploadPageController',
        components: [
          {
            content: 'Some markdown text',
            id: expect.any(String),
            name: 'MarkdownComponent',
            options: {},
            title: 'Markdown Component',
            type: 'Markdown'
          },
          {
            hint: '',
            id: expect.any(String),
            name: 'TextField',
            options: {},
            schema: {},
            shortDescription: 'Text field',
            title: 'Text field',
            type: 'FileUploadField'
          }
        ],
        title: 'Page title',
        path: '/page-one',
        next: []
      })
    })
  })

  describe('modifyAssignSections', () => {
    it('should assign sections to pages', () => {
      const page1 = buildQuestionPage({
        id: 'page-1',
        title: 'Page 1'
      })
      const page2 = buildQuestionPage({
        id: 'page-2',
        title: 'Page 2'
      })

      const definition = buildDefinition({
        pages: [page1, page2],
        sections: []
      })

      /** @type {SectionAssignmentItem[]} */
      const sectionAssignments = [
        {
          name: 'section-1',
          title: 'Section 1',
          pageIds: ['page-1']
        },
        {
          name: 'section-2',
          title: 'Section 2',
          pageIds: ['page-2']
        }
      ]

      const modified = modifyAssignSections(definition, sectionAssignments)

      expect(modified.sections).toHaveLength(2)
      expect(modified.sections[0]).toMatchObject({
        id: expect.any(String),
        name: 'section-1',
        title: 'Section 1'
      })
      expect(modified.sections[1]).toMatchObject({
        id: expect.any(String),
        name: 'section-2',
        title: 'Section 2'
      })
      expect(modified.pages[0].section).toBe(modified.sections[0].id)
      expect(modified.pages[1].section).toBe(modified.sections[1].id)
    })

    it('should clear existing section assignments', () => {
      const page1 = buildQuestionPage({
        id: 'page-1',
        title: 'Page 1',
        section: 'old-section'
      })

      const definition = buildDefinition({
        pages: [page1],
        sections: [{ name: 'old-section', title: 'Old Section' }]
      })

      /** @type {SectionAssignmentItem[]} */
      const sectionAssignments = [
        {
          name: 'new-section',
          title: 'New Section',
          pageIds: []
        }
      ]

      const modified = modifyAssignSections(definition, sectionAssignments)

      expect(modified.pages[0].section).toBeUndefined()
    })

    it('should handle empty sections array', () => {
      const page1 = buildQuestionPage({
        id: 'page-1',
        title: 'Page 1',
        section: 'old-section'
      })

      const definition = buildDefinition({
        pages: [page1],
        sections: [{ name: 'old-section', title: 'Old Section' }]
      })

      const modified = modifyAssignSections(definition, [])

      expect(modified.sections).toHaveLength(0)
      expect(modified.pages[0].section).toBeUndefined()
    })

    it('should preserve existing section id when provided', () => {
      const existingId = '550e8400-e29b-41d4-a716-446655440000'
      const page1 = buildQuestionPage({
        id: 'page-1',
        title: 'Page 1'
      })

      const definition = buildDefinition({
        pages: [page1],
        sections: []
      })

      /** @type {SectionAssignmentItem[]} */
      const sectionAssignments = [
        {
          id: existingId,
          name: 'section-1',
          title: 'Section 1',
          pageIds: ['page-1']
        }
      ]

      const modified = modifyAssignSections(definition, sectionAssignments)

      expect(modified.sections[0].id).toBe(existingId)
      expect(modified.pages[0].section).toBe(existingId)
    })

    it('should auto-generate name from title when name not provided', () => {
      const definition = buildDefinition({
        pages: [],
        sections: []
      })

      /** @type {SectionAssignmentItem[]} */
      const sectionAssignments = [
        {
          title: 'Contact Details',
          pageIds: []
        },
        {
          title: 'Unicorn Information',
          pageIds: []
        }
      ]

      const modified = modifyAssignSections(definition, sectionAssignments)

      expect(modified.sections[0]).toMatchObject({
        id: expect.any(String),
        name: 'contact-details',
        title: 'Contact Details'
      })
      expect(modified.sections[1]).toMatchObject({
        id: expect.any(String),
        name: 'unicorn-information',
        title: 'Unicorn Information'
      })
    })

    it('should handle hideTitle property', () => {
      const definition = buildDefinition({
        pages: [],
        sections: []
      })

      /** @type {SectionAssignmentItem[]} */
      const sectionAssignments = [
        {
          name: 'hidden-section',
          title: 'Hidden Section',
          hideTitle: true,
          pageIds: []
        }
      ]

      const modified = modifyAssignSections(definition, sectionAssignments)

      expect(modified.sections[0]).toMatchObject({
        name: 'hidden-section',
        title: 'Hidden Section',
        hideTitle: true
      })
    })

    it('should not include hideTitle when undefined', () => {
      const definition = buildDefinition({
        pages: [],
        sections: []
      })

      /** @type {SectionAssignmentItem[]} */
      const sectionAssignments = [
        {
          name: 'section-1',
          title: 'Section 1',
          pageIds: []
        }
      ]

      const modified = modifyAssignSections(definition, sectionAssignments)

      expect(modified.sections[0]).not.toHaveProperty('hideTitle')
    })
  })

  describe('modfiyUpdateOption', () => {
    it('should add then update the option', () => {
      const definition = buildDefinition({
        pages: [questionPageWithComponent]
      })

      const modified = modifyUpdateOption(definition, 'showReferenceNumber', 'true')

      expect(modified.options?.showReferenceNumber).toBe(true)

      const updated = modifyUpdateOption(definition, 'showReferenceNumber', 'false')

      expect(updated.options?.showReferenceNumber).toBe(false)
    })
  })

  describe('buildSectionsResponse', () => {
    it('should build sections with pageIds from page assignments', () => {
      const sectionId = '550e8400-e29b-41d4-a716-446655440000'
      const page1 = buildQuestionPage({
        id: 'page-1',
        section: sectionId
      })
      const page2 = buildQuestionPage({
        id: 'page-2',
        path: '/page-two',
        section: sectionId
      })
      const definition = buildDefinition({
        pages: [page1, page2],
        sections: [{ id: sectionId, name: 'section-1', title: 'Section 1' }]
      })

      const result = buildSectionsResponse(definition)

      expect(result).toEqual([
        {
          id: sectionId,
          name: 'section-1',
          title: 'Section 1',
          pageIds: ['page-1', 'page-2']
        }
      ])
    })

    it('should handle sections with no assigned pages', () => {
      const sectionId = '550e8400-e29b-41d4-a716-446655440001'
      const page1 = buildQuestionPage({
        id: 'page-1'
      })
      const definition = buildDefinition({
        pages: [page1],
        sections: [{ id: sectionId, name: 'empty-section', title: 'Empty' }]
      })

      const result = buildSectionsResponse(definition)

      expect(result).toEqual([
        {
          id: sectionId,
          name: 'empty-section',
          title: 'Empty',
          pageIds: []
        }
      ])
    })

    it('should handle hideTitle property', () => {
      const sectionId = '550e8400-e29b-41d4-a716-446655440002'
      const definition = buildDefinition({
        pages: [],
        sections: [
          {
            id: sectionId,
            name: 'hidden-section',
            title: 'Hidden Section',
            hideTitle: true
          }
        ]
      })

      const result = buildSectionsResponse(definition)

      expect(result).toEqual([
        {
          id: sectionId,
          name: 'hidden-section',
          title: 'Hidden Section',
          hideTitle: true,
          pageIds: []
        }
      ])
    })

    it('should not include hideTitle when undefined', () => {
      const sectionId = '550e8400-e29b-41d4-a716-446655440003'
      const definition = buildDefinition({
        pages: [],
        sections: [{ id: sectionId, name: 'section-1', title: 'Section 1' }]
      })

      const result = buildSectionsResponse(definition)

      expect(result[0]).not.toHaveProperty('hideTitle')
    })

    it('should handle multiple sections with different page assignments', () => {
      const section1Id = '550e8400-e29b-41d4-a716-446655440004'
      const section2Id = '550e8400-e29b-41d4-a716-446655440005'

      const page1 = buildQuestionPage({
        id: 'page-1',
        section: section1Id
      })
      const page2 = buildQuestionPage({
        id: 'page-2',
        path: '/page-two',
        section: section2Id
      })
      const page3 = buildQuestionPage({
        id: 'page-3',
        path: '/page-three',
        section: section1Id
      })

      const definition = buildDefinition({
        pages: [page1, page2, page3],
        sections: [
          { id: section1Id, name: 'section-1', title: 'Section 1' },
          { id: section2Id, name: 'section-2', title: 'Section 2' }
        ]
      })

      const result = buildSectionsResponse(definition)

      expect(result).toEqual([
        {
          id: section1Id,
          name: 'section-1',
          title: 'Section 1',
          pageIds: ['page-1', 'page-3']
        },
        {
          id: section2Id,
          name: 'section-2',
          title: 'Section 2',
          pageIds: ['page-2']
        }
      ])
    })

    it('should return empty array for definition with no sections', () => {
      const definition = buildDefinition({
        pages: [buildQuestionPage({ id: 'page-1' })],
        sections: []
      })

      const result = buildSectionsResponse(definition)

      expect(result).toEqual([])
    })
  })
})

/**
 * @import { SectionAssignmentItem } from '@defra/forms-model'
 */
