import { randomUUID } from 'node:crypto'

import {
  ApiErrorCode,
  ComponentType,
  ControllerType,
  formDefinitionV2Schema,
  hasComponents,
  hasComponentsEvenIfNoNext,
  hasRepeater,
  isConditionWrapperV2,
  isFormType,
  isSummaryPage,
  slugify
} from '@defra/forms-model'
import Boom from '@hapi/boom'
import { ObjectId } from 'mongodb'

import { validate } from '~/src/api/forms/service/helpers/definition.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import { DEFINITION_COLLECTION_NAME, db } from '~/src/mongo.js'

const logger = createLogger()

/**
 * Removes a row in a MongoDB collection by its unique ID and fail if not completed.
 * @param {ClientSession} session
 * @param {string} collectionName - name of the collection to remove from
 * @param {string} id - object _id
 */
export async function removeById(session, collectionName, id) {
  const coll = db.collection(collectionName)

  const result = await coll.deleteOne({ _id: new ObjectId(id) }, { session })
  const { deletedCount } = result

  if (deletedCount !== 1) {
    throw new Error(
      `Failed to delete id '${id}' from '${collectionName}'. Expected deleted count of 1, received ${deletedCount}`
    )
  }
}

/**
 * @param {FormDefinition} definition
 * @param {string} pageId
 */
export function findPage(definition, pageId) {
  return definition.pages.find((page) => page.id === pageId)
}

/**
 * Gets the position a new page should be inserted
 * @param {FormDefinition} definition
 */
export function getPageInsertPosition(definition) {
  const pages = definition.pages

  return pages.length && isSummaryPage(pages[pages.length - 1]) ? -1 : undefined
}

/**
 * Get a page by id
 * @param {FormDefinition} definition
 * @param {string} pageId
 * @throws {Boom}
 */
export function getPage(definition, pageId) {
  const page = findPage(definition, pageId)

  if (!page) {
    throw Boom.notFound(`Page not found with id '${pageId}'`)
  }

  return page
}

/**
 * Finds a component by pageId & componentId
 * @param {FormDefinition} definition
 * @param {string} pageId
 * @param {string} componentId
 * @returns {ComponentDef | undefined}
 */
export function findComponent(definition, pageId, componentId) {
  const page = findPage(definition, pageId)

  if (!hasComponentsEvenIfNoNext(page)) {
    return undefined
  }

  return page.components.find((component) => component.id === componentId)
}

/**
 * Get a component by pageId & componentId
 * @param {FormDefinition} definition
 * @param {string} pageId
 * @param {string} componentId
 * @throws {Boom}
 */
export function getComponent(definition, pageId, componentId) {
  const page = getPage(definition, pageId)

  if (!hasComponentsEvenIfNoNext(page)) {
    throw Boom.notFound(`Component not found on page '${page.id}' with id '${componentId}' - page has no components`)
  }

  const idx = getComponentIndex(page, componentId)

  return page.components[idx]
}

/**
 * Find page index by id
 * @param {FormDefinition} definition
 * @param {string} pageId
 * @returns {number}
 */
export function findPageIndex(definition, pageId) {
  return definition.pages.findIndex((page) => page.id === pageId)
}

/**
 * Get page index by id
 * @param {FormDefinition} definition
 * @param {string} pageId
 * @returns {number}
 * @throws {Boom}
 */
export function getPageIndex(definition, pageId) {
  const idx = findPageIndex(definition, pageId)

  if (idx === -1) {
    throw Boom.notFound(`Page not found with id '${pageId}'`)
  }

  return idx
}

/**
 * Find component index by id
 * @param {Page} page
 * @param {string} componentId
 * @returns {number}
 */
export function findComponentIndex(page, componentId) {
  return hasComponentsEvenIfNoNext(page) ? page.components.findIndex((component) => component.id === componentId) : -1
}

/**
 * Get component index by id
 * @param {Page} page
 * @param {string} componentId
 * @returns {number}
 * @throws {Boom}
 */
export function getComponentIndex(page, componentId) {
  const idx = findComponentIndex(page, componentId)

  if (idx === -1) {
    throw Boom.notFound(`Component not found on page '${page.id}' with id '${componentId}'`)
  }

  return idx
}

/**
 * Find list index by id
 * @param {FormDefinition} definition
 * @param {string} listId
 * @returns {number}
 */
export function findListIndex(definition, listId) {
  return definition.lists.findIndex((list) => list.id === listId)
}

/**
 * Get list index by id
 * @param {FormDefinition} definition
 * @param {string} listId
 * @returns {number}
 * @throws {Boom}
 */
export function getListIndex(definition, listId) {
  const idx = findListIndex(definition, listId)

  if (idx === -1) {
    throw Boom.notFound(`List not found with id '${listId}'`)
  }

  return idx
}

/**
 * Get list index by id
 * @param {FormDefinition} definition
 * @param {string} listId
 * @returns {List}
 * @throws {Boom}
 */
export function getList(definition, listId) {
  const idx = getListIndex(definition, listId)

  return definition.lists[idx]
}

/**
 * Find condition index by id
 * @param {FormDefinition} definition
 * @param {string} conditionId
 * @returns {number}
 */
export function findConditionIndex(definition, conditionId) {
  return definition.conditions.filter(isConditionWrapperV2).findIndex((condition) => condition.id === conditionId)
}

/**
 * Get condition index by id
 * @param {FormDefinition} definition
 * @param {string} conditionId
 * @returns {number}
 * @throws {Boom}
 */
export function getConditionIndex(definition, conditionId) {
  const idx = findConditionIndex(definition, conditionId)

  if (idx === -1) {
    throw Boom.notFound(`Condition not found with id '${conditionId}'`)
  }

  return idx
}

/**
 * Get condition index by id
 * @param {FormDefinition} definition
 * @param {string} conditionId
 * @returns {ConditionWrapperV2}
 * @throws {Boom}
 */
export function getCondition(definition, conditionId) {
  const idx = getConditionIndex(definition, conditionId)
  const condition = definition.conditions[idx]

  if (!isConditionWrapperV2(condition)) {
    throw Boom.notFound(`Condition not found with id '${conditionId}'`)
  }

  return condition
}

/**
 * @param {FormDefinition} formDraftDefinition
 * @param {string} path
 * @param {string} message
 * @param {ApiErrorCode} [errorCode]
 * @param {string} [excludePageId]
 */
export function uniquePathGate(
  formDraftDefinition,
  path,
  message,
  errorCode = ApiErrorCode.General,
  excludePageId = ''
) {
  if (formDraftDefinition.pages.some((page) => page.path === path && page.id !== excludePageId)) {
    throw Boom.conflict(message, { errorCode })
  }
}

/**
 * Inserts a draft form definition
 * @param {string} formId - the form id
 * @param {FormDefinition} definition - the form definitiom
 * @param {ClientSession} session - the mongo transaction session
 * @param {ObjectSchema<FormDefinition>} schema - the schema to use (defaults to V2)
 */
export async function insertDraft(formId, definition, session, schema = formDefinitionV2Schema) {
  // Validate form definition
  const draft = validate(definition, schema)

  const id = { _id: new ObjectId(formId) }

  // Persist the new draft
  const coll = /** @satisfies {Collection<{draft: FormDefinition}>} */ (db.collection(DEFINITION_COLLECTION_NAME))

  const insertResult = await coll.findOneAndUpdate(
    id,
    { $setOnInsert: { draft } },
    {
      upsert: true,
      returnDocument: 'after',
      session
    }
  )

  if (!insertResult) {
    throw Boom.notFound(`Unexpected empty result from 'findOneAndUpdate'`)
  }

  return insertResult
}

/**
 * Updates a draft form definition
 * @param {string} formId - the form id
 * @param {UpdateCallback} updateCallback - the update callback
 * @param {ClientSession} session - the mongo transaction session
 * @param {ObjectSchema<FormDefinition>} schema - the schema to use (defaults to V2)
 */
export async function modifyDraft(formId, updateCallback, session, schema = formDefinitionV2Schema) {
  const coll = /** @satisfies {Collection<{draft?: FormDefinition}>} */ (db.collection(DEFINITION_COLLECTION_NAME))

  const id = { _id: new ObjectId(formId) }
  const document = await coll.findOne(id)

  if (!document) {
    throw Boom.notFound(`Document not found '${formId}'`)
  }

  if (!document.draft) {
    throw Boom.notFound(`Draft not found in document '${formId}'`)
  }

  // Apply the update
  const updated = updateCallback(document.draft)

  // Validate form definition
  const draft = validate(updated, schema)

  // Persist the updated draft
  const coll2 = /** @satisfies {Collection<{draft: FormDefinition}>} */ (db.collection(DEFINITION_COLLECTION_NAME))

  const updateResult = await coll2.findOneAndUpdate(
    id,
    { $set: { draft } },
    {
      session,
      returnDocument: 'after'
    }
  )

  if (!updateResult) {
    throw Boom.notFound(`Unexpected empty result from 'findOneAndUpdate'`)
  }

  return updateResult
}

/**
 * Updates the engine version of a form definition
 * @param {FormDefinition} definition
 * @param {Engine} engineVersion
 * @returns {FormDefinition}
 */
export function modifyEngineVersion(definition, engineVersion) {
  definition.engine = engineVersion

  return definition
}

/**
 * Updates the name of a form definition
 * @param {FormDefinition} definition
 * @param {string} name - new name for the form
 * @returns {FormDefinition}
 */
export function modifyName(definition, name) {
  definition.name = name

  return definition
}

/**
 * Delete matching pages from a form definition
 * @param {FormDefinition} definition
 * @param {RemovePagePredicate} predicate
 * @returns {FormDefinition}
 */
export function modifyDeletePages(definition, predicate) {
  definition.pages = definition.pages.filter((page) => !predicate(page))

  return definition
}

/**
 * Add a page at the position number - defaults to the last page
 * @param {FormDefinition} definition
 * @param {Page} page
 * @param {number | undefined} [position]
 * @returns {FormDefinition}
 */
export function modifyAddPage(definition, page, position) {
  if (position === undefined) {
    definition.pages.push(page)
  } else {
    definition.pages.splice(position, 0, page)
  }

  return definition
}

/**
 * Updates a page with specific page id
 * @param {FormDefinition} definition
 * @param {Page} page
 * @param {string} pageId
 * @returns {FormDefinition}
 */
export function modifyUpdatePage(definition, page, pageId) {
  const idx = getPageIndex(definition, pageId)

  definition.pages[idx] = page

  return definition
}

/**
 * Reorders the pages
 * @param {FormDefinition} definition
 * @param {string[]} order
 * @returns {FormDefinition}
 */
export function modifyReorderPages(definition, order) {
  const MAX = Number.MAX_SAFE_INTEGER

  definition.pages.sort((a, b) => {
    const posA = a.id && order.includes(a.id) ? order.indexOf(a.id) : MAX
    const posB = b.id && order.includes(b.id) ? order.indexOf(b.id) : MAX

    return posA - posB
  })

  return definition
}

/**
 * Reorders the pages
 * @param {FormDefinition} definition
 * @param {string} pageId
 * @param {string[]} order
 * @returns {FormDefinition}
 */
export function modifyReorderComponents(definition, pageId, order) {
  const MAX = Number.MAX_SAFE_INTEGER

  const page = getPage(definition, pageId)

  if (hasComponents(page)) {
    page.components.sort((a, b) => {
      const posA = a.id && order.includes(a.id) ? order.indexOf(a.id) : MAX
      const posB = b.id && order.includes(b.id) ? order.indexOf(b.id) : MAX

      return posA - posB
    })
  }

  return definition
}

/**
 * Adds a new component to the end of a page components array
 * @param {FormDefinition} definition
 * @param {string} pageId
 * @param {ComponentDef} component
 * @param {number | undefined} [position]
 * @returns {FormDefinition}
 */
export function modifyAddComponent(definition, pageId, component, position) {
  const idx = getPageIndex(definition, pageId)
  const page = definition.pages[idx]

  if (!hasComponentsEvenIfNoNext(page) && isSummaryPage(page)) {
    const summaryPage = /** @type {PageSummary | PageSummaryWithConfirmationEmail} */ (page)
    summaryPage.components = []
  }

  if (hasComponentsEvenIfNoNext(page)) {
    if (position === undefined) {
      page.components.push(component)
    } else {
      page.components.splice(position, 0, component)
    }
  }

  return definition
}

/**
 * Updates a component with component id
 * @param {FormDefinition} definition
 * @param {string} pageId
 * @param {string} componentId
 * @param {ComponentDef} component
 * @returns {FormDefinition}
 */
export function modifyUpdateComponent(definition, pageId, componentId, component) {
  const pageIdx = getPageIndex(definition, pageId)
  const page = definition.pages[pageIdx]
  const componentIdx = getComponentIndex(page, componentId)

  if (hasComponentsEvenIfNoNext(page)) {
    page.components[componentIdx] = component
  }

  return definition
}

/**
 * Deletes a component with component id
 * @param {FormDefinition} definition
 * @param {string} pageId
 * @param {string} componentId
 * @returns {FormDefinition}
 */
export function modifyDeleteComponent(definition, pageId, componentId) {
  const page = getPage(definition, pageId)
  const componentIdx = getComponentIndex(page, componentId)

  if (hasComponentsEvenIfNoNext(page)) {
    page.components.splice(componentIdx, 1)
  }

  return definition
}

/**
 * Causes SIDE-EFFECTS to incoming Page
 * @param {Page} page
 * @param { ControllerType | null | undefined } controller
 */
export function handleControllerPatch(page, controller) {
  if (controller) {
    page.controller = controller
    if (controller === ControllerType.FileUpload && hasComponents(page)) {
      // There could be a markdown component (or other non-form components) so look for first non-content field
      const firstFormComponent = page.components.find((comp) => isFormType(comp.type))
      if (firstFormComponent) {
        firstFormComponent.type = ComponentType.FileUploadField
      }
    }
  }
  if (controller === null) {
    delete page.controller
  }
}

/**
 * Deletes a component with component id
 * @param {FormDefinition} definition
 * @param {string} pageId
 * @param {PatchPageFields} pageFields
 * @returns {FormDefinition}
 */
export function modifyUpdatePageFields(definition, pageId, pageFields) {
  const page = getPage(definition, pageId)

  const { title, path, controller, repeat, condition } = pageFields

  if (title || title === '') {
    page.title = title
  }
  if (path) {
    page.path = path
  }

  handleControllerPatch(page, controller)

  // Repeater
  if (repeat && hasRepeater(page)) {
    page.repeat = repeat
  }

  // Condition
  if (condition !== undefined) {
    if (condition === null) {
      delete page.condition
    } else {
      page.condition = condition
    }
  }

  return definition
}

/**
 * Deletes a page with page id
 * @param {FormDefinition} definition
 * @param {string} pageId
 * @returns {FormDefinition}
 */
export function modifyDeletePage(definition, pageId) {
  const idx = getPageIndex(definition, pageId)

  definition.pages.splice(idx, 1)

  return definition
}

/**
 * Adds a new list
 * @param {FormDefinition} definition
 * @param {List} list
 * @returns {FormDefinition}
 */
export function modifyAddList(definition, list) {
  definition.lists.push(list)

  return definition
}

/**
 * Updates a form list by id
 * @param {FormDefinition} definition
 * @param {string} listId
 * @param {List} list
 * @returns {FormDefinition}
 */
export function modifyUpdateList(definition, listId, list) {
  const idx = getListIndex(definition, listId)

  definition.lists[idx] = list

  return definition
}

/**
 * Removes a list by id
 * @param {FormDefinition} definition
 * @param {string} listId
 * @returns {FormDefinition}
 */
export function modifyDeleteList(definition, listId) {
  const idx = getListIndex(definition, listId)

  definition.lists.splice(idx, 1)

  return definition
}

/**
 * Adds a new condition
 * @param {FormDefinition} definition
 * @param {ConditionWrapperV2} condition
 * @returns {FormDefinition}
 */
export function modifyAddCondition(definition, condition) {
  definition.conditions.push(condition)

  return definition
}

/**
 * Updates a condition by id
 * @param {FormDefinition} definition
 * @param {string} conditionId
 * @param {ConditionWrapperV2} condition
 * @returns {FormDefinition}
 */
export function modifyUpdateCondition(definition, conditionId, condition) {
  const idx = getConditionIndex(definition, conditionId)

  definition.conditions[idx] = condition

  return definition
}

/**
 * Removes a condition by id
 * @param {FormDefinition} definition
 * @param {string} conditionId
 * @returns {FormDefinition}
 */
export function modifyDeleteCondition(definition, conditionId) {
  const idx = getConditionIndex(definition, conditionId)

  definition.conditions.splice(idx, 1)

  return definition
}

/**
 * Unassigns a condition from all pages that reference it
 * @param {FormDefinition} definition
 * @param {string} conditionId
 * @returns {FormDefinition}
 */
export function modifyUnassignCondition(definition, conditionId) {
  definition.pages.forEach((page) => {
    if (page.condition === conditionId) {
      logger.info(`Unassigning condition ${conditionId} from page ${page.id ?? 'unknown'}`)
      delete page.condition
    }
  })

  return definition
}

/**
 * Assigns sections to pages in the form definition.
 * Replaces the sections array and updates page section assignments.
 * @param {FormDefinition} definition
 * @param {SectionAssignmentItem[]} sectionAssignments
 * @returns {FormDefinition}
 */
export function modifyAssignSections(definition, sectionAssignments) {
  const sectionsWithIds = sectionAssignments.map((assignment) => ({
    ...assignment,
    id: assignment.id ?? randomUUID(),
    name: assignment.name ?? slugify(assignment.title)
  }))

  /** @type {Map<string, string>} */
  const pageToSectionMap = new Map()

  for (const section of sectionsWithIds) {
    for (const pageId of section.pageIds) {
      pageToSectionMap.set(pageId, section.id)
    }
  }

  // Update the sections array with the new sections (without pageIds)
  definition.sections = sectionsWithIds.map(({ id, name, title, hideTitle }) => ({
    id,
    name,
    title,
    ...(hideTitle !== undefined && { hideTitle })
  }))

  // First, clear all existing section assignments from pages
  for (const page of definition.pages) {
    delete page.section
  }

  // Then, assign sections to pages based on the mapping (using section ID)
  for (const page of definition.pages) {
    if (page.id && pageToSectionMap.has(page.id)) {
      page.section = pageToSectionMap.get(page.id)
    }
  }

  return definition
}

/**
 * Builds sections response with pageIds from the definition
 * @param {FormDefinition} definition
 * @returns {SectionAssignmentItem[]}
 */
export function buildSectionsResponse(definition) {
  /** @type {Map<string, string[]>} */
  const sectionToPages = new Map()

  // Build map of sectionId -> pageIds
  for (const page of definition.pages) {
    if (page.id && page.section) {
      const pageIds = sectionToPages.get(page.section) ?? []
      pageIds.push(page.id)
      sectionToPages.set(page.section, pageIds)
    }
  }

  // Return sections with their pageIds
  return definition.sections.map((section) => ({
    id: section.id,
    name: section.name,
    title: section.title,
    ...(section.hideTitle !== undefined && { hideTitle: section.hideTitle }),
    pageIds: sectionToPages.get(section.id ?? '') ?? []
  }))
}

/**
 * Updates an option
 * @param {FormDefinition} definition
 * @param {string} optionName
 * @param {string} optionValue
 * @returns {FormDefinition}
 */
export function modifyUpdateOption(definition, optionName, optionValue) {
  // Set defaults if 'options' is missing
  definition.options =
    definition.options ??
    /** @type {FormOptions} */ ({
      showReferenceNumber: false
    })

  if (optionName === 'showReferenceNumber') {
    // Convert to boolean
    definition.options.showReferenceNumber = optionValue === 'true'
  }

  return definition
}

/**
 * The update callback method
 * @callback UpdateCallback
 * @param {FormDefinition} definition
 * @returns {FormDefinition}
 */

/**
 * The remove page predicate method
 * @callback RemovePagePredicate
 * @param {Page} page
 * @returns {boolean}
 */

/**
 * @import { FormDefinition, FormOptions, Page, ComponentDef, List, PatchPageFields, Engine, ConditionWrapperV2, PageSummary, PageSummaryWithConfirmationEmail, SectionAssignmentItem } from '@defra/forms-model'
 * @import { ClientSession, Collection } from 'mongodb'
 * @import { ObjectSchema } from 'joi'
 */
