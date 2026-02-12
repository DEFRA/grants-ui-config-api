import {
  ConditionType,
  ControllerType,
  Coordinator,
  Engine,
  OperatorName,
  hasNext,
  isConditionWrapper
} from '@defra/forms-model'
import { buildRadioComponent } from '@defra/forms-model/stubs'
import { clone } from '@hapi/hoek'
import Joi, { ValidationError } from 'joi'

import {
  buildDefinition,
  buildList,
  buildListItem,
  buildQuestionPage,
  buildStatusPage,
  buildSummaryPage,
  buildSummaryPageWithConfirmation,
  buildTextFieldComponent
} from '~/src/api/forms/__stubs__/definition.js'
import { InvalidFormDefinitionError } from '~/src/api/forms/errors.js'
import { convertConditionDataToV2, isConditionData } from '~/src/api/forms/service/condition-migration-helpers.js'
import {
  addComponentIdsToDefinition,
  applyPageTitles,
  convertConditions,
  convertControllerPathsToNames,
  convertDeclaration,
  convertListNamesToIds,
  convertSectionNamesToIds,
  mapComponent,
  migrateComponentFields,
  migrateToV2,
  populateComponentIds,
  repositionSummary,
  summaryHelper
} from '~/src/api/forms/service/migration-helpers.js'

jest.mock('@defra/forms-model', () => ({
  ...jest.requireActual('@defra/forms-model'),
  hasNext: jest.fn(() => true),
  isConditionWrapper: jest.fn(() => false)
}))
jest.mock('~/src/api/forms/service/condition-migration-helpers.js', () => ({
  ...jest.requireActual('~/src/api/forms/service/condition-migration-helpers.js'),
  convertConditionDataToV2: jest.fn((x) => x),
  isConditionData: jest.fn(() => true)
}))

describe('migration helpers', () => {
  const summaryPageId = '449a45f6-4541-4a46-91bd-8b8931b07b50'

  const summaryPageWithoutComponents = buildSummaryPage({
    id: summaryPageId
  })

  const summaryPageWithoutComponentsWithConfirmation = buildSummaryPageWithConfirmation({
    id: summaryPageId
  })

  const componentWithoutAnId = buildTextFieldComponent({
    name: 'Ghcbma'
  })
  delete componentWithoutAnId.id

  const componentOne = buildTextFieldComponent({
    id: '380429e0-2d2d-4fbf-90fb-34364f488af1',
    name: 'Ghcbmb'
  })
  const componentTwo = buildTextFieldComponent({
    id: '52e34be1-a528-4e10-a5eb-06aed317fb7f',
    name: 'Ghcbmw'
  })
  const componentOneNoId = buildTextFieldComponent({
    ...componentOne,
    id: undefined
  })
  const componentTwoNoId = buildTextFieldComponent({
    ...componentTwo
  })
  delete componentTwoNoId.id

  const pageOne = buildQuestionPage({
    id: '73cf34ee-f53a-4159-9eef-b0286fd81934',
    components: [
      buildTextFieldComponent({
        id: '1c61fa1f-a8dc-463c-ade0-13aa7cbf4960'
      })
    ]
  })

  const pageTwo = buildQuestionPage({
    id: 'c7766963-fd9d-4ad9-90a7-88b0ef856b76',
    title: 'Page two',
    path: '/path-two',
    components: [componentOne, componentTwo]
  })

  const pageWithTwoComponents = buildQuestionPage({
    id: '73cf34ee-f53a-4159-9eef-b0286fd81934',
    components: [
      buildTextFieldComponent({
        id: '1c61fa1f-a8dc-463c-ade0-13aa7cbf4960'
      }),
      buildTextFieldComponent({
        id: '2aaafa1f-a8dc-463c-ade0-13aa7cbf1234'
      })
    ]
  })

  const pageOneUndefinedId = buildQuestionPage({
    ...pageOne,
    id: undefined
  })
  const pageTwoNoIds = buildQuestionPage({
    ...pageTwo,
    components: [componentOneNoId, componentTwoNoId]
  })
  delete pageTwoNoIds.id

  describe('summaryHelper', () => {
    it('should push the summary to the end if it not in the correct place', () => {
      const definition = buildDefinition({
        pages: [summaryPageWithoutComponents, pageOneUndefinedId]
      })
      expect(summaryHelper(definition)).toEqual({
        indexOf: 0,
        shouldRepositionSummary: true,
        summaryExists: true,
        summary: summaryPageWithoutComponents
      })
    })

    it('should not push summary to the end if it is in the correct place', () => {
      const definition = buildDefinition({
        pages: [pageOneUndefinedId, summaryPageWithoutComponents]
      })
      expect(summaryHelper(definition)).toEqual({
        indexOf: 1,
        shouldRepositionSummary: false,
        summaryExists: true,
        summary: summaryPageWithoutComponents
      })
    })

    it('should not push summary to the end if no pages', () => {
      const definition = buildDefinition({
        pages: []
      })
      expect(summaryHelper(definition)).toEqual({
        indexOf: -1,
        shouldRepositionSummary: false,
        summaryExists: false,
        summary: undefined
      })
    })

    it('should not push summary to the end if summary page does not exist', () => {
      const definition = buildDefinition({
        pages: [pageOneUndefinedId]
      })
      expect(summaryHelper(definition)).toEqual({
        indexOf: -1,
        shouldRepositionSummary: false,
        summaryExists: false,
        summary: undefined
      })
    })
  })

  describe('repositionSummary', () => {
    const expectedDefinition = buildDefinition({
      pages: [pageOneUndefinedId, summaryPageWithoutComponents]
    })

    it('should move definition to the end if it is not in place', () => {
      const definition1 = buildDefinition({
        pages: [summaryPageWithoutComponents, pageOneUndefinedId]
      })

      expect(repositionSummary(definition1)).toEqual(expectedDefinition)
    })

    it('should no change the order if summary is in the correct place', () => {
      const definition1 = buildDefinition({
        pages: [pageOneUndefinedId, summaryPageWithoutComponents]
      })
      const definition2 = buildDefinition({
        pages: []
      })
      const definition3 = buildDefinition({
        pages: [pageOneUndefinedId]
      })

      expect(repositionSummary(definition1)).toEqual(expectedDefinition)
      expect(repositionSummary(definition2)).toEqual(definition2)
      expect(repositionSummary(definition3)).toEqual(definition3)
    })
  })

  describe('mapComponent', () => {
    it('should add short description if a form component', () => {
      const definition = buildDefinition({
        pages: [pageTwo]
      })
      const component = buildTextFieldComponent({
        id: '380429e0-2d2d-4fbf-90fb-34364f488af1',
        name: 'Ghcbmb'
      })

      expect(mapComponent(definition, component)).toEqual({
        id: '380429e0-2d2d-4fbf-90fb-34364f488af1',
        name: 'Ghcbmb',
        hint: '',
        options: {},
        schema: {},
        type: 'TextField',
        title: 'Text field',
        shortDescription: 'Text field'
      })
    })

    it('should add short description and list if a form component and has a list', () => {
      const definition = buildDefinition({
        pages: [pageTwo],
        lists: [/** @type {List} */ ({ id: 'list-guid' })]
      })
      const component = buildRadioComponent({
        id: '380429e0-2d2d-4fbf-90fb-34364f488af1',
        name: 'Ghcbmb',
        list: 'list-guid'
      })

      expect(mapComponent(definition, component)).toEqual({
        id: '380429e0-2d2d-4fbf-90fb-34364f488af1',
        name: 'Ghcbmb',
        list: 'list-guid',
        options: {},
        type: 'RadiosField',
        title: 'Which country do you live in?',
        shortDescription: 'Which country do you live in?'
      })
    })

    it('should leave component unchanged if not a form component', () => {
      const definition = buildDefinition({
        pages: [pageTwo],
        lists: [/** @type {List} */ ({ id: 'list-guid' })]
      })
      const component = /** @type {ComponentDef} */ ({
        id: '380429e0-2d2d-4fbf-90fb-34364f488af1',
        name: 'Ghcbmb'
      })

      expect(mapComponent(definition, component)).toEqual({
        id: '380429e0-2d2d-4fbf-90fb-34364f488af1',
        name: 'Ghcbmb'
      })
    })
  })

  describe('populateComponentIds', () => {
    it('should return unchanged if no components in page', () => {
      const testPage = buildQuestionPage()
      const page = populateComponentIds(testPage)
      expect(page).toEqual(testPage)
    })

    it('should return unchanged if page is not one with components', () => {
      const testPage = buildStatusPage({})
      const page = populateComponentIds(testPage)
      expect(page).toEqual(testPage)
    })

    it('should return unchanged if page has a component but component already has id', () => {
      const testPage = buildQuestionPage({
        components: [
          buildTextFieldComponent({
            id: 'f0449907-e3fe-4c9e-a954-dc4f8ae778f8'
          })
        ]
      })
      const page = populateComponentIds(testPage)
      expect(page).toEqual(testPage)
    })

    it('should return populated if page has a component where component has no id', () => {
      const testPage = buildQuestionPage({
        components: [componentWithoutAnId]
      })
      expect(testPage.components[0].id).toBeUndefined()
      const page = /** @type {PageQuestion} */ (populateComponentIds(testPage))
      expect(page.components[0].id).toBeDefined()
    })
  })

  describe('applyPageTitles', () => {
    const pages = /** @type {[PageQuestion, PageQuestion, Page]} */ ([
      pageOne,
      pageTwoNoIds,
      summaryPageWithoutComponents
    ])

    const definitionV1 = buildDefinition({
      pages,
      sections: [{ hideTitle: false, name: 'section', title: 'Section title' }],
      engine: Engine.V1
    })

    const pageOneModel = /** @type {PageQuestion} */ (definitionV1.pages[0])

    const pageTwoModel = /** @type {PageQuestion} */ (definitionV1.pages[1])

    it('should add page titles from first component per page', () => {
      pageOneModel.title = ''
      pageOneModel.components[0].title = 'Text field page 1'
      pageTwoModel.title = ''
      pageTwoModel.components[0].title = 'Text field page 2'
      const res = applyPageTitles(definitionV1)
      expect(res.pages[0].title).toBe('Text field page 1')
      expect(res.pages[1].title).toBe('Text field page 2')
    })

    it('should not add page titles if they already exist', () => {
      pageOneModel.title = 'Page title 1'
      pageOneModel.components[0].title = 'Text field page 1'
      pageTwoModel.title = 'Page title 2'
      pageTwoModel.components[0].title = 'Text field page 2'
      const res = applyPageTitles(definitionV1)
      expect(res.pages[0].title).toBe('Page title 1')
      expect(res.pages[1].title).toBe('Page title 2')
    })

    it('should leave page title to be blank if no applicable values', () => {
      pageOneModel.title = ''
      pageOneModel.components[0].title = ''
      pageTwoModel.title = ''
      pageTwoModel.components[0].title = ''
      const res = applyPageTitles(definitionV1)
      expect(res.pages[0].title).toBe('')
      expect(res.pages[1].title).toBe('')
    })

    it('should leave page title to be blank if no applicable components', () => {
      definitionV1.pages[0] = /** @type {PageStatus} */ {
        title: '',
        path: '/status1',
        controller: ControllerType.Status
      }
      definitionV1.pages[1] = /** @type {PageStatus} */ {
        title: '',
        path: '/status2',
        controller: ControllerType.Status
      }
      const res = applyPageTitles(definitionV1)
      expect(res.pages[0].title).toBe('')
      expect(res.pages[1].title).toBe('')
    })
  })

  describe('migrateComponentFields', () => {
    const testPages = /** @type {[PageQuestion, Page]} */ ([pageWithTwoComponents, summaryPageWithoutComponents])

    const testDefinitionV1 = buildDefinition({
      pages: testPages,
      sections: [{ hideTitle: false, name: 'section', title: 'Section title' }],
      engine: Engine.V1
    })

    const pageModel = /** @type {PageQuestion} */ (testDefinitionV1.pages[0])
    pageModel.components[0].title = 'First title page 1 component 1'
    pageModel.components[1].title = 'Second title page 1 component 2'

    it('should add page titles from first component per page', () => {
      const res = migrateComponentFields(testDefinitionV1)
      const page1 = /** @type {PageQuestion} */ (res.pages[0])

      expect(page1.components[0]).toEqual({
        hint: '',
        id: '1c61fa1f-a8dc-463c-ade0-13aa7cbf4960',
        name: 'TextField',
        type: 'TextField',
        title: 'First title page 1 component 1',
        shortDescription: 'First title page 1 component 1',
        options: {},
        schema: {}
      })
      expect(page1.components[1]).toEqual({
        hint: '',
        id: '2aaafa1f-a8dc-463c-ade0-13aa7cbf1234',
        name: 'TextField',
        type: 'TextField',
        title: 'Second title page 1 component 2',
        shortDescription: 'Second title page 1 component 2',
        options: {},
        schema: {}
      })
    })
  })

  describe('convertDeclaration', () => {
    const testPages = /** @type {[PageQuestion, PageSummary]} */ ([pageWithTwoComponents, summaryPageWithoutComponents])

    const testDefinitionV1 = buildDefinition({
      pages: testPages,
      sections: [{ hideTitle: false, name: 'section', title: 'Section title' }],
      engine: Engine.V1,
      declaration: 'Some declaration text'
    })

    it('should move declaration to guidance component', () => {
      const summaryPage = /** @type {PageQuestion} */ (testDefinitionV1.pages[1])
      expect(summaryPage.components).toBeUndefined()
      expect(testDefinitionV1.declaration).toBe('Some declaration text')
      const res = convertDeclaration(testDefinitionV1)

      expect(res.declaration).toBeUndefined()

      const summaryPageRes = /** @type {PageQuestion} */ (res.pages[1])
      expect(summaryPageRes.components).toHaveLength(1)
      expect(summaryPageRes.components[0]).toEqual({
        content: 'Some declaration text',
        title: 'Markdown',
        name: 'Markdown',
        type: 'Markdown',
        options: {}
      })
    })

    it('should not create guidance component if declaration blank', () => {
      const testDefinition2 = buildDefinition({
        pages: [
          buildSummaryPage({
            id: summaryPageId
          })
        ],
        sections: [{ hideTitle: false, name: 'section', title: 'Section title' }],
        engine: Engine.V1,
        declaration: ''
      })

      const summaryPage = /** @type {PageQuestion} */ (testDefinition2.pages[0])
      expect(summaryPage).toBeDefined()
      expect(summaryPage.components).toBeUndefined()
      expect(testDefinition2.declaration).toBe('')
      const res = convertDeclaration(testDefinition2)

      const summaryPageRes = /** @type {PageQuestion} */ (res.pages[0])
      expect(summaryPageRes.components).toHaveLength(0)
      expect(res.declaration).toBeUndefined()
    })

    it('should not create guidance component if declaration missing', () => {
      const testDefinition2 = buildDefinition({
        pages: [
          buildSummaryPage({
            id: summaryPageId
          })
        ],
        sections: [{ hideTitle: false, name: 'section', title: 'Section title' }],
        engine: Engine.V1
      })

      const summaryPage = /** @type {PageQuestion} */ (testDefinition2.pages[0])
      expect(summaryPage).toBeDefined()
      expect(summaryPage.components).toBeUndefined()
      expect(testDefinition2.declaration).toBeUndefined()
      const res = convertDeclaration(testDefinition2)

      const summaryPageRes = /** @type {PageQuestion} */ (res.pages[0])
      expect(summaryPageRes.components).toHaveLength(0)
      expect(res.declaration).toBeUndefined()
    })

    it('should create summary page if missing and move declaration to it', () => {
      const testDefinition3 = buildDefinition({
        pages: [],
        sections: [{ hideTitle: false, name: 'section', title: 'Section title' }],
        engine: Engine.V1,
        declaration: 'Some declaration'
      })

      const res = convertDeclaration(testDefinition3)

      // Should remove declaration from root
      expect(res.declaration).toBeUndefined()

      // Should have a summary page created
      const summaryPage = res.pages.find((page) => page.controller === ControllerType.Summary)
      expect(summaryPage).toBeDefined()
      expect(summaryPage?.components).toHaveLength(1)
      expect(summaryPage?.components?.[0]).toEqual({
        content: 'Some declaration',
        title: 'Markdown',
        name: 'Markdown',
        type: 'Markdown',
        options: {}
      })
    })
  })

  describe('migrateToV2', () => {
    const pages = /** @type {[Page, PageQuestion, PageQuestion]} */ ([
      summaryPageWithoutComponents,
      pageOneUndefinedId,
      pageTwoNoIds
    ])

    const components = /** @type {[ComponentDef, ComponentDef]} */ (pages[2].components)
    const countryList = buildList({
      items: [
        buildListItem({
          value: 'england',
          text: 'England'
        })
      ]
    })

    const definitionV1 = buildDefinition({
      pages,
      sections: [{ hideTitle: false, name: 'section', title: 'Section title' }],
      engine: Engine.V1,
      lists: [countryList]
    })

    const definitionV2WithConfirmation = {
      ...buildDefinition({
        sections: [{ hideTitle: false, name: 'section', title: 'Section title' }],
        engine: Engine.V2
      }),
      pages: [
        {
          ...pages[1],
          id: expect.any(String)
        },
        {
          ...pages[2],
          id: expect.any(String),
          components: [
            {
              ...components[0],
              id: expect.any(String)
            },
            {
              ...components[1],
              id: expect.any(String)
            }
          ]
        },
        {
          ...pages[0],
          id: expect.any(String),
          controller: ControllerType.SummaryWithConfirmationEmail
        }
      ],
      lists: [
        {
          ...countryList,
          id: expect.any(String)
        }
      ]
    }

    it('should migrate to version v2', () => {
      expect(migrateToV2(definitionV1)).toMatchObject(definitionV2WithConfirmation)
    })

    it('migration is an idempotent operation', () => {
      const migration1 = migrateToV2(definitionV1)
      const migration2 = migrateToV2(clone(migration1))

      expect(migration1).toMatchObject(migration2)
    })

    it('should throw if there is some error in validation', () => {
      const partialDefinition = /** @type {Partial<FormDefinition>} */ {
        unknownProperty: true
      }
      // @ts-expect-error unknownProperty is not a valid property of formDefinition
      const invalidDefinition = buildDefinition(partialDefinition)
      expect(() => migrateToV2(invalidDefinition)).toThrow(
        new InvalidFormDefinitionError(new ValidationError('"unknownProperty" is not allowed', [], undefined))
      )
    })

    it('should not perform any changes if component and page ids exist and summary controller has been previously upgraded', () => {
      const definition = buildDefinition({
        pages: [pageOneUndefinedId, pageTwoNoIds, summaryPageWithoutComponentsWithConfirmation],
        sections: [{ hideTitle: false, name: 'section', title: 'Section title' }]
      })

      const pages = /** @type {[PageQuestion, PageQuestion, Page]} */ (definition.pages)

      const components = /** @type {[ComponentDef, ComponentDef]} */ (pages[1].components)

      expect(migrateToV2(definition)).toMatchObject({
        ...definition,
        engine: Engine.V2,
        pages: [
          {
            ...pages[0],
            id: expect.any(String)
          },
          {
            ...pages[1],
            id: expect.any(String),
            components: [
              {
                ...components[0],
                id: expect.any(String)
              },
              {
                ...components[1],
                id: expect.any(String)
              }
            ]
          },
          {
            ...pages[2],
            id: expect.any(String)
          }
        ]
      })
    })

    it('should perform controller upgrade if summary controller is old', () => {
      const definition = buildDefinition({
        pages: [pageOneUndefinedId, pageTwoNoIds, summaryPageWithoutComponents],
        sections: [{ hideTitle: false, name: 'section', title: 'Section title' }]
      })

      const pages = /** @type {[PageQuestion, PageQuestion, Page]} */ (definition.pages)

      const components = /** @type {[ComponentDef, ComponentDef]} */ (pages[1].components)

      expect(migrateToV2(definition)).toMatchObject({
        ...definition,
        engine: Engine.V2,
        pages: [
          {
            ...pages[0],
            id: expect.any(String)
          },
          {
            ...pages[1],
            id: expect.any(String),
            components: [
              {
                ...components[0],
                id: expect.any(String)
              },
              {
                ...components[1],
                id: expect.any(String)
              }
            ]
          },
          {
            ...summaryPageWithoutComponentsWithConfirmation,
            id: expect.any(String)
          }
        ]
      })
    })

    describe('convertListNamesToIds', () => {
      it('should convert component list names to ids', () => {
        const definition = /** @type {FormDefinition} */ ({
          lists: [{ name: 'countries' }],
          pages: [
            {
              components: [{ type: 'RadiosField', list: 'countries' }]
            }
          ]
        })

        const result = convertListNamesToIds(definition)

        // @ts-expect-error type doesn't really matter when we have the below checks
        const newListReference = result.pages[0].components[0].list

        expect(newListReference).not.toBe('countries')
        expect(result.lists[0].id).toBe(newListReference)
      })

      it('should leave components unchanged if no list property', () => {
        const definition = /** @type {FormDefinition} */ ({
          lists: [{ name: 'countries', id: 'id1' }],
          pages: [
            {
              components: [{ type: 'TextField' }]
            }
          ]
        })

        const result = convertListNamesToIds(definition)
        // @ts-expect-error we know this is a TextField in a test
        expect(result.pages[0].components[0]).toEqual({ type: 'TextField' })
      })

      it('should throw if component list name does not exist in lists', () => {
        const definition = /** @type {FormDefinition} */ ({
          lists: [{ name: 'countries', id: 'id1' }],
          pages: [
            {
              components: [{ type: 'RadiosField', list: 'notfound' }]
            }
          ]
        })

        expect(() => convertListNamesToIds(definition)).toThrow(
          'List name "notfound" not found in definition lists - cannot migrate'
        )
      })

      it('should leave pages unchanged if no components', () => {
        const definition = /** @type {FormDefinition} */ ({
          lists: [{ name: 'countries', id: 'id1' }],
          pages: [{ title: 'No components' }]
        })

        const result = convertListNamesToIds(definition)
        expect(result.pages[0]).toEqual({ title: 'No components' })
      })
    })
  })
})

describe('convertConditions', () => {
  beforeAll(() => {
    jest.spyOn(global.Math, 'random').mockReturnValue(0.12345)
    Object.defineProperty(global, 'crypto', {
      value: { randomUUID: () => 'mock-uuid' },
      configurable: true
    })
  })

  afterAll(() => {
    jest.restoreAllMocks()
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('converts v1 condition wrappers to v2 and updates page condition references', () => {
    /**
     * @type {ConditionDataV2}
     */
    const dummyConditionItem = {
      id: 'newConditionUuid',
      componentId: 'myNewUuid',
      operator: OperatorName.Is,
      type: ConditionType.StringValue,
      value: 'foobar'
    }

    jest.mocked(isConditionWrapper).mockReturnValue(true)
    jest.mocked(isConditionData).mockReturnValue(true)
    jest.mocked(hasNext).mockReturnValue(true)
    jest.mocked(convertConditionDataToV2).mockReturnValue(dummyConditionItem)

    const definition = buildMinimalDefinition({
      pages: [
        buildQuestionPage({
          condition: 'cond1'
        })
      ],
      conditions: [
        {
          type: 'ConditionWrapper',
          name: 'cond1',
          displayName: 'Condition 1',
          value: {
            conditions: [{ name: 'item1' }]
          }
        }
      ]
    })

    const result = convertConditions(definition)

    // @ts-expect-error this is a V2 object, we do have an ID
    const uuidValidation = Joi.string().uuid().validate(result.conditions[0].id)

    expect(uuidValidation.error).toBeUndefined()

    expect(result.conditions[0]).toMatchObject({
      id: uuidValidation.value,
      displayName: 'Condition 1',
      items: expect.arrayContaining([dummyConditionItem])
    })
  })

  it('keeps already v2 conditions unchanged', () => {
    const dummyCondition = {
      id: 'already-v2',
      displayName: 'V2',
      items: [
        {
          id: 'newConditionUuid',
          componentId: 'myNewUuid',
          operator: OperatorName.Is,
          value: {
            type: ConditionType.StringValue,
            value: 'foobar'
          }
        }
      ]
    }

    jest.mocked(isConditionWrapper).mockReturnValue(false)
    const definition = buildMinimalDefinition({
      conditions: [dummyCondition]
    })
    const result = convertConditions(definition)

    expect(result.conditions).toHaveLength(1)
    expect(result.conditions[0]).toEqual(dummyCondition)
  })

  it('throws if unsupported condition type found', () => {
    jest.mocked(isConditionWrapper).mockReturnValue(true)
    jest.mocked(isConditionData).mockReturnValue(false)
    const definition = buildMinimalDefinition({
      conditions: [
        {
          type: 'ConditionWrapper',
          name: 'cond1',
          displayName: 'Condition 1',
          value: {
            conditions: [{ name: 'item1' }]
          }
        }
      ]
    })
    expect(() => convertConditions(definition)).toThrow('Unsupported condition type found')
  })

  it('throws if multiple unique coordinators found', () => {
    /**
     * @type {ConditionDataV2}
     */
    const dummyConditionItem = {
      id: 'newConditionUuid',
      componentId: 'myNewUuid',
      operator: OperatorName.Is,
      type: ConditionType.StringValue,
      value: 'foobar'
    }

    jest.mocked(isConditionWrapper).mockReturnValue(true)
    jest.mocked(isConditionData).mockReturnValue(true)
    jest.mocked(convertConditionDataToV2).mockReturnValueOnce(dummyConditionItem)

    const definition = buildMinimalDefinition({
      conditions: [
        {
          type: 'ConditionWrapper',
          name: 'cond1',
          displayName: 'Condition 1',
          value: {
            conditions: [
              { name: 'item1' },
              { name: 'item2', coordinator: Coordinator.AND },
              { name: 'item3', coordinator: Coordinator.OR }
            ]
          }
        }
      ]
    })

    expect(() => convertConditions(definition)).toThrow(
      'Different unique coordinators found in condition items. Manual intervention is required.'
    )
  })

  it('sets coordinator if only one unique coordinator is present', () => {
    /**
     * @type {ConditionDataV2}
     */
    const dummyConditionItem = {
      id: 'newConditionUuid',
      componentId: 'myNewUuid',
      operator: OperatorName.Is,
      type: ConditionType.StringValue,
      value: 'foobar'
    }

    jest.mocked(isConditionWrapper).mockReturnValue(true)
    jest.mocked(isConditionData).mockReturnValue(true)
    jest.mocked(convertConditionDataToV2).mockReturnValueOnce(dummyConditionItem)

    const definition = buildMinimalDefinition({
      conditions: [
        {
          type: 'ConditionWrapper',
          name: 'cond1',
          displayName: 'Condition 1',
          value: {
            conditions: [
              { name: 'item1' },
              { name: 'item2', coordinator: Coordinator.AND },
              { name: 'item3', coordinator: Coordinator.AND }
            ]
          }
        }
      ]
    })
    const result = convertConditions(definition)

    // @ts-expect-error: coordinator is only present on ConditionWrapperV2, not ConditionWrapper
    expect(result.conditions[0].coordinator).toBe(Coordinator.AND)
  })

  it('does not set coordinator if no coordinator present', () => {
    /**
     * @type {ConditionDataV2}
     */
    const dummyConditionItem = {
      id: 'newConditionUuid',
      componentId: 'myNewUuid',
      operator: OperatorName.Is,
      type: ConditionType.StringValue,
      value: 'foobar'
    }

    jest.mocked(isConditionWrapper).mockReturnValue(true)
    jest.mocked(isConditionData).mockReturnValue(true)
    jest.mocked(convertConditionDataToV2).mockReturnValueOnce(dummyConditionItem)

    const definition = buildMinimalDefinition({
      conditions: [
        {
          type: 'ConditionWrapper',
          name: 'cond1',
          displayName: 'Condition 1',
          value: {
            conditions: [{ name: 'item1' }]
          }
        }
      ]
    })
    const result = convertConditions(definition)

    // @ts-expect-error: coordinator is only present on ConditionWrapperV2, not ConditionWrapper
    expect(result.conditions[0].coordinator).toBeUndefined()
  })

  it('drops unused conditions that fail migration', () => {
    jest.mocked(isConditionWrapper).mockReturnValue(true)
    jest.mocked(isConditionData).mockReturnValue(true)
    jest.mocked(convertConditionDataToV2).mockReturnValueOnce(null)

    const definition = buildMinimalDefinition({
      conditions: [
        {
          type: 'ConditionWrapper',
          name: 'cond1',
          displayName: 'Condition 1',
          value: {
            conditions: [{ name: 'item1' }]
          }
        }
      ]
    })
    const result = convertConditions(definition)

    expect(result.conditions).toHaveLength(0) // if the condition item fails migration and the overall condition is now empty, it should be dropped
  })
})

describe('convertListNamesToIds', () => {
  it('maps list names to their IDs', () => {
    const definition = buildMinimalDefinition({
      pages: [
        {
          id: 'page1',
          components: [
            {
              type: 'RadiosField',
              list: 'List 1'
            }
          ]
        }
      ],
      lists: [{ name: 'List 1' }]
    })

    const result = convertListNamesToIds(definition)

    // @ts-expect-error: list is only present on RadiosField, not PageQuestion
    expect(result.pages[0].components[0].list).toEqual(result.lists[0].id)
    expect(result.lists).toEqual([
      {
        id: expect.any(String),
        name: 'List 1'
      }
    ])
  })

  it('ignores non-list components', () => {
    const definition = buildMinimalDefinition({
      pages: [
        {
          id: 'page1',
          components: [
            {
              type: 'TextField'
            }
          ]
        }
      ],
      lists: [{ name: 'List 1' }]
    })

    const result = convertListNamesToIds(definition)

    // @ts-expect-error: list is only present on RadiosField, not PageQuestion
    expect(result.pages[0].components[0].list).toBeUndefined()
  })

  it('handles pages without components', () => {
    const definition = buildMinimalDefinition({
      pages: [
        {
          id: 'page1',
          components: []
        }
      ]
    })

    const result = convertListNamesToIds(definition)

    expect(result.pages).toEqual(definition.pages)
  })

  it("throws an error if the list referenced by a component doesn't exist", () => {
    const definition = buildMinimalDefinition({
      pages: [
        {
          id: 'page1',
          components: [
            {
              type: 'RadiosField',
              list: 'invalidList'
            }
          ]
        }
      ],
      lists: [{ name: 'validList' }]
    })

    expect(() => convertListNamesToIds(definition)).toThrow(
      'List name "invalidList" not found in definition lists - cannot migrate'
    )
  })
})

describe('convertSectionNamesToIds', () => {
  it('maps section names to their IDs on pages', () => {
    const definition = buildMinimalDefinition({
      sections: [{ name: 'personalDetails', title: 'Personal Details' }],
      pages: [
        {
          id: 'page1',
          section: 'personalDetails'
        }
      ]
    })

    const result = convertSectionNamesToIds(definition)

    // Section should have an ID generated
    expect(result.sections[0].id).toBeDefined()

    // Page section reference should be updated to use the section ID
    expect(result.pages[0].section).toBe(result.sections[0].id)
  })

  it('preserves existing section IDs', () => {
    const existingId = '550e8400-e29b-41d4-a716-446655440000'
    const definition = buildMinimalDefinition({
      sections: [{ id: existingId, name: 'personalDetails', title: 'Personal Details' }],
      pages: [
        {
          id: 'page1',
          section: 'personalDetails'
        }
      ]
    })

    const result = convertSectionNamesToIds(definition)

    // Existing ID should be preserved
    expect(result.sections[0].id).toBe(existingId)

    // Page section reference should be updated to use the section ID
    expect(result.pages[0].section).toBe(existingId)
  })

  it('leaves pages unchanged if they have no section', () => {
    const definition = buildMinimalDefinition({
      sections: [{ name: 'personalDetails', title: 'Personal Details' }],
      pages: [
        {
          id: 'page1'
        }
      ]
    })

    const result = convertSectionNamesToIds(definition)

    expect(result.pages[0].section).toBeUndefined()
  })

  it('removes invalid section references from pages', () => {
    const definition = buildMinimalDefinition({
      sections: [{ name: 'personalDetails', title: 'Personal Details' }],
      pages: [
        {
          id: 'page1',
          section: 'nonExistentSection'
        }
      ]
    })

    const result = convertSectionNamesToIds(definition)

    // Invalid section reference should be removed
    expect(result.pages[0].section).toBeUndefined()
  })

  it('handles multiple sections and pages', () => {
    const definition = buildMinimalDefinition({
      sections: [
        { name: 'section1', title: 'Section 1' },
        { name: 'section2', title: 'Section 2' }
      ],
      pages: [
        { id: 'page1', section: 'section1' },
        { id: 'page2', section: 'section2' },
        { id: 'page3' } // No section
      ]
    })

    const result = convertSectionNamesToIds(definition)

    // Both sections should have IDs
    expect(result.sections[0].id).toBeDefined()
    expect(result.sections[1].id).toBeDefined()

    // Pages should reference correct section IDs
    expect(result.pages[0].section).toBe(result.sections[0].id)
    expect(result.pages[1].section).toBe(result.sections[1].id)
    expect(result.pages[2].section).toBeUndefined()
  })
})

describe('addComponentIdsToDefinition', () => {
  it('should add ids to components in pages', () => {
    const definition = buildMinimalDefinition({
      pages: [
        {
          components: [
            {
              id: '123-456-789'
            }
          ]
        }
      ]
    })

    const result = addComponentIdsToDefinition(definition)

    // @ts-expect-error we know there will be a component
    expect(result.pages[0].components[0].id).toBe('123-456-789')
  })

  it('should not change pages without components', () => {
    const definition = buildMinimalDefinition({
      pages: [
        {
          components: [
            {
              name: 'alPzmd'
            }
          ]
        }
      ]
    })

    const result = addComponentIdsToDefinition(definition)

    // @ts-expect-error we know there will be a component
    expect(result.pages[0].components[0].id).toBeDefined()
  })
})

describe('convertControllerPathsToNames', () => {
  it('should convert controller paths to names in page definitions', () => {
    const definition = buildMinimalDefinition({
      pages: [
        {
          title: 'Question page'
        },
        {
          title: 'Status page',
          controller: 'StatusPageController'
        }
      ]
    })

    const result = convertControllerPathsToNames(definition)

    expect(result.pages[0].controller).toBeUndefined()
    expect(result.pages[1].controller).toBe('StatusPageController')
  })

  it('should handle JS-based controller paths', () => {
    const definition = buildMinimalDefinition({
      pages: [
        {
          title: 'Status page',
          controller: './pages/summary.js'
        }
      ]
    })

    const result = convertControllerPathsToNames(definition)
    expect(result.pages[0].controller).toBe('SummaryPageController')
  })
})

/**
 * Build a minimal form definition for testing.
 * @param {object} [overrides]
 * @returns {FormDefinition}
 */
function buildMinimalDefinition(overrides = {}) {
  return buildDefinition({
    pages: [buildQuestionPage({})],
    lists: [],
    sections: [],
    conditions: [],
    ...overrides
  })
}

/**
 * @import { FormDefinition, List, PageQuestion, Page, PageSummary, ComponentDef, ConditionDataV2, PageSummaryWithConfirmationEmail } from '@defra/forms-model'
 */
