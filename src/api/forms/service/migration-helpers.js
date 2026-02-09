import { randomUUID } from 'crypto'

import {
  ComponentType,
  ControllerType,
  ControllerTypes,
  Engine,
  SchemaVersion,
  formDefinitionV2Schema,
  getComponentDefaults,
  hasComponents,
  hasComponentsEvenIfNoNext,
  hasFormField,
  hasListField,
  hasNext,
  isConditionWrapper,
  isSummaryPage
} from '@defra/forms-model'

import { convertConditionDataToV2, isConditionData } from '~/src/api/forms/service/condition-migration-helpers.js'
import { validate } from '~/src/api/forms/service/helpers/definition.js'
/**
 * @param {FormDefinition} definition
 * @returns {{
 *  readonly summary: PageSummary | undefined;
 *  shouldRepositionSummary: boolean;
 *  summaryExists: boolean;
 *  indexOf: number;
 * }}
 */
export function summaryHelper(definition) {
  const lastIndex = definition.pages.length - 1
  const summaryIndex = definition.pages.findIndex((page) => isSummaryPage(page))
  const summaryExists = summaryIndex >= 0
  const shouldRepositionSummary = summaryExists && summaryIndex !== lastIndex

  return {
    summaryExists,
    shouldRepositionSummary,
    get summary() {
      const summaryPage = /** @type {PageSummary | undefined} */ (definition.pages[summaryIndex])
      return summaryPage
    },
    indexOf: summaryIndex
  }
}

/**
 * @param {Page[]} pages
 * @param {number} indexOf
 * @returns {Page[]}
 */
function removeSummary(pages, indexOf) {
  return /** @type {Page[]} */ (pages.toSpliced(indexOf, 1))
}

/**
 * Repositions summary to the end of the pages
 * @param {FormDefinition} definition
 */
export function repositionSummary(definition) {
  const summaryHelperOutput = summaryHelper(definition)
  const { shouldRepositionSummary } = summaryHelperOutput

  if (shouldRepositionSummary) {
    const { summary, indexOf } = /** @type {{ summary: PageSummary, indexOf: number}} */ (summaryHelperOutput)

    const pagesWithoutSummary = removeSummary(definition.pages, indexOf)

    return {
      ...definition,
      pages: [...pagesWithoutSummary, summary]
    }
  }

  return definition
}

/**
 * Repositions summary to the end of the pages
 * @param {FormDefinition} definition
 */
export function upgradeSummary(definition) {
  const summaryHelperOutput = summaryHelper(definition)

  const { summary, indexOf } =
    /** @type {{ summary: PageSummary | PageSummaryWithConfirmationEmail, indexOf: number}} */ (summaryHelperOutput)

  if (summary.controller === ControllerType.Summary) {
    const pagesWithoutSummary = removeSummary(definition.pages, indexOf)

    return /** @type {FormDefinition} */ ({
      ...definition,
      pages: [
        ...pagesWithoutSummary,
        {
          ...summary,
          controller: ControllerType.SummaryWithConfirmationEmail
        }
      ]
    })
  }

  return definition
}

/**
 * Applies page titles if they are missing
 * @param {FormDefinition} definition
 */
export function applyPageTitles(definition) {
  const changedPages = definition.pages.map((page) => {
    if (!isSummaryPage(page) && !page.title) {
      return {
        ...page,
        title: hasComponents(page) ? page.components[0].title : ''
      }
    }

    return page
  })

  return {
    ...definition,
    pages: changedPages
  }
}

/**
 * @param {FormDefinition} definition
 * @param {ComponentDef} component - ** fn may mutate component **
 */
export function mapComponent(definition, component) {
  let updatedComponent = component
  if (hasFormField(component)) {
    if (hasListField(component)) {
      const list = definition.lists.find((x) => x.id === component.list)
      if (list?.id) {
        updatedComponent = {
          ...component,
          list: list.id
        }
      }
    }

    return {
      ...updatedComponent,
      shortDescription: component.title
    }
  }

  return component
}

/**
 * Migrates component fields
 * @param {FormDefinition} definition
 */
export function migrateComponentFields(definition) {
  const changedPages = definition.pages.map((page) => {
    if (!hasComponentsEvenIfNoNext(page)) {
      return page
    }

    const changeComponents = page.components.map((comp) => {
      return mapComponent(definition, comp)
    })

    return {
      ...page,
      components: changeComponents
    }
  })

  return {
    ...definition,
    pages: changedPages
  }
}

/**
 * Converts declaration text to a guidance component
 * @param {FormDefinition} originalDefinition
 */
export function convertDeclaration(originalDefinition) {
  const definition = structuredClone(originalDefinition)

  const summaryPage = /** @type { PageSummary | undefined } */ (definition.pages.find((p) => isSummaryPage(p)))

  let declarationComponent

  if (definition.declaration) {
    declarationComponent = /** @type {MarkdownComponent} */ (getComponentDefaults({ type: ComponentType.Markdown }))
    declarationComponent.content = definition.declaration
  }

  if (summaryPage && declarationComponent) {
    summaryPage.components = summaryPage.components ?? []
    summaryPage.components.unshift(declarationComponent)
  } else if (!summaryPage && declarationComponent) {
    definition.pages.push({
      title: 'Check your answers',
      controller: ControllerType.Summary,
      path: '/summary',
      components: [declarationComponent]
    })
  } else if (summaryPage && !declarationComponent) {
    summaryPage.components = summaryPage.components ?? []
  } else {
    definition.pages.push({
      title: 'Check your answers',
      controller: ControllerType.Summary,
      path: '/summary',
      components: []
    })
  }

  delete definition.declaration

  return definition
}

/**
 * @param {Page} pageWithoutComponentIds
 */
export function populateComponentIds(pageWithoutComponentIds) {
  if (!hasComponentsEvenIfNoNext(pageWithoutComponentIds)) {
    return pageWithoutComponentIds
  }

  return {
    ...pageWithoutComponentIds,
    components: pageWithoutComponentIds.components.map((component) => {
      if (Object.hasOwn(component, 'id')) {
        return component
      }
      return {
        ...component,
        id: randomUUID()
      }
    })
  }
}

/**
 * Populates component ids for all pages in the form definition.
 * If a component does not have an id, it generates a new one.
 * @param {FormDefinition} definition
 * @returns {FormDefinition}
 */
export function addComponentIdsToDefinition(definition) {
  const pagesWithIds = definition.pages.map((page) => populateComponentIds(page))

  return {
    ...definition,
    pages: pagesWithIds
  }
}

/**
 * Converts a form from using list names to using list ids.
 * For each component on each page, if the component has a "list" property referencing a list by name,
 * it replaces it with the corresponding list's id.
 * @param {FormDefinition} definition
 * @returns {FormDefinition}
 */
export function convertListNamesToIds(definition) {
  // Ensure all lists have an id
  const lists = definition.lists.map((list) => {
    if (list.id) {
      return list
    }

    return {
      ...list,
      id: randomUUID()
    }
  })

  // Build a map from list name to id
  const nameToId = new Map(lists.map((list) => [list.name, list.id]))

  // Update components on each page to use list id instead of name
  const pages = definition.pages.map((page) => {
    if (!hasComponentsEvenIfNoNext(page)) {
      return page
    }

    const components = page.components.map((component) => {
      if (hasListField(component)) {
        const newListReference = nameToId.get(component.list)

        if (!newListReference) {
          throw new Error(`List name "${component.list}" not found in definition lists - cannot migrate`)
        }

        return {
          ...component,
          list: newListReference
        }
      }
      return component
    })
    return {
      ...page,
      components
    }
  })

  return {
    ...definition,
    pages,
    lists
  }
}

/**
 * Converts a form from using section names to using section ids.
 * For each page, if it has a "section" property referencing a section by name,
 * it replaces it with the corresponding section's id.
 * @param {FormDefinition} definition
 * @returns {FormDefinition}
 */
export function convertSectionNamesToIds(definition) {
  // Ensure all sections have an id
  /** @type {SectionWithId[]} */
  const sections = definition.sections.map((section) => {
    const sectionWithId = /** @type {SectionWithId} */ (section)
    if (sectionWithId.id) {
      return sectionWithId
    }

    return {
      ...section,
      id: randomUUID()
    }
  })

  // Build a map from section name to id
  const nameToId = new Map(sections.map((section) => [section.name, section.id]))

  // Update pages to use section id instead of name
  const pages = definition.pages.map((page) => {
    if (!page.section) {
      return page
    }

    const newSectionReference = nameToId.get(page.section)

    if (!newSectionReference) {
      // Section name not found - remove invalid reference
      delete page.section
      return page
    }

    return {
      ...page,
      section: newSectionReference
    }
  })

  return {
    ...definition,
    pages,
    sections
  }
}

/**
 * Build a map from component name (old) to component id (new) for all components in all pages
 * @param {FormDefinition} definition
 * @returns {Map<string, string>}
 */
function getComponentNameToIdMap(definition) {
  const fieldNameToComponentId = new Map()

  const componentPages = definition.pages.filter(hasComponentsEvenIfNoNext)

  for (const page of componentPages) {
    for (const component of page.components) {
      if (typeof component.name === 'string' && typeof component.id === 'string') {
        fieldNameToComponentId.set(component.name, component.id)
      }
    }
  }
  return fieldNameToComponentId
}

/**
 * Gets a set of condition names that are in use across all pages.
 * @param {FormDefinition} definition
 */
function getConditionNamesInUse(definition) {
  return new Set(
    definition.pages.flatMap((page) => {
      if (hasNext(page)) {
        return page.next.map((next) => next.condition).filter((condition) => condition !== undefined)
      }
      return []
    })
  )
}

/**
 *
 * @param {ConditionWrapper} conditionWrapper
 * @param {Map<string, string>} fieldNameToComponentId
 * @param {Set<string>} conditionsInUse
 * @param {FormDefinition} definition
 */
function convertConditionWrapperToV2(conditionWrapper, fieldNameToComponentId, conditionsInUse, definition) {
  const coordinators = new Set()

  const items = conditionWrapper.value.conditions
    .map((conditionData) => {
      if (!isConditionData(conditionData)) {
        throw new Error(`Unsupported condition type found`)
      }

      if (conditionData.coordinator) {
        coordinators.add(conditionData.coordinator)
      }

      return convertConditionDataToV2(conditionData, fieldNameToComponentId, conditionsInUse, definition)
    })
    .filter((item) => item !== null)

  /**
   * @type {ConditionWrapperV2}
   */
  const condition = {
    id: randomUUID(),
    displayName: conditionWrapper.displayName,
    items
  }

  if (items.length > 1 && coordinators.size > 1) {
    throw new Error('Different unique coordinators found in condition items. Manual intervention is required.')
  } else if (items.length > 1 && coordinators.size === 1) {
    condition.coordinator = coordinators.values().next().value
  } else {
    // keep Sonar happy - nothing we need to do here, we don't need a coordinator
  }

  return condition
}

/**
 * Converts conditions in the condition from schema v1 to v2.
 * @param {FormDefinition} definition
 */
export function convertConditions(definition) {
  const fieldNameToComponentId = getComponentNameToIdMap(definition)

  const conditionsInUse = getConditionNamesInUse(definition)

  const conditionNamesToIds = new Map()

  /**
   * @type {FormDefinition['conditions']}
   */
  const newConditions = definition.conditions
    .map((conditionWrapper) => {
      if (isConditionWrapper(conditionWrapper)) {
        const newConditionWrapper = convertConditionWrapperToV2(
          conditionWrapper,
          fieldNameToComponentId,
          conditionsInUse,
          definition
        )

        conditionNamesToIds.set(conditionWrapper.name, newConditionWrapper.id)

        return newConditionWrapper
      } else {
        // Already in new format, return as is
        return conditionWrapper
      }
    })
    .filter((newConditionWrapper) => newConditionWrapper.items.length) // filter out conditions that have no items

  const pages = definition.pages.map((page) => {
    if (page.condition) {
      page.condition = conditionNamesToIds.get(page.condition)
    }
    return page
  })

  return {
    ...definition,
    pages,
    conditions: newConditions
  }
}

/**
 * Converts any controller paths to names
 * @param {FormDefinition} definition
 * @returns {FormDefinition}
 */
export function convertControllerPathsToNames(definition) {
  const pages = definition.pages.map((page) => {
    if (page.controller?.endsWith('.js')) {
      const name = ControllerTypes.find((n) => n.path === page.controller?.toString())?.name

      if (!name) {
        throw new Error(`Unrecognised controller name found for ${page.controller}. Cannot migrate.`)
      }

      page.controller = name
    }

    return page
  })

  return {
    ...definition,
    pages
  }
}

const migrationSteps = [
  convertControllerPathsToNames,
  repositionSummary,
  upgradeSummary,
  applyPageTitles,
  migrateComponentFields,
  convertDeclaration,
  convertListNamesToIds,
  convertSectionNamesToIds,
  addComponentIdsToDefinition,
  convertConditions
]

/**
 * Apply transformations to FormDefinition
 * @param {FormDefinition} definition
 * @returns {FormDefinition} definition
 */
function applyMigrationSteps(definition) {
  return migrationSteps.reduce((acc, transformation) => {
    return transformation(acc)
  }, definition)
}

/**
 * Migrates a v1 definition to v2
 * @param {FormDefinition} definition
 * @returns {FormDefinition}
 */
export function migrateToV2(definition) {
  const migratedDefinition = applyMigrationSteps(definition)

  migratedDefinition.engine = Engine.V2
  migratedDefinition.schema = SchemaVersion.V2

  const value = validate(migratedDefinition, formDefinitionV2Schema)

  return value
}

/**
 * Section with required id field (for V2 schema migration)
 * @typedef {object} SectionWithId
 * @property {string} id - The section ID
 * @property {string} name - The section name
 * @property {string} title - The section title
 * @property {boolean} [hideTitle] - Whether to hide the section title
 */

/**
 * @import { ComponentDef, FormDefinition, MarkdownComponent, Page, PageSummary, PageSummaryWithConfirmationEmail, ConditionWrapper, ConditionWrapperV2 } from '@defra/forms-model'
 */
