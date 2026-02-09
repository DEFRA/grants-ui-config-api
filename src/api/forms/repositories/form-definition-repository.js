import { FormStatus, getErrorMessage } from '@defra/forms-model'
import Boom from '@hapi/boom'
import { ObjectId } from 'mongodb'

import {
  buildSectionsResponse,
  getComponent,
  getCondition,
  getList,
  getPageInsertPosition,
  insertDraft,
  modifyAddComponent,
  modifyAddCondition,
  modifyAddList,
  modifyAddPage,
  modifyAssignSections,
  modifyDeleteComponent,
  modifyDeleteCondition,
  modifyDeleteList,
  modifyDeletePage,
  modifyDeletePages,
  modifyDraft,
  modifyEngineVersion,
  modifyName,
  modifyReorderComponents,
  modifyReorderPages,
  modifyUnassignCondition,
  modifyUpdateComponent,
  modifyUpdateCondition,
  modifyUpdateList,
  modifyUpdateOption,
  modifyUpdatePage,
  modifyUpdatePageFields,
  removeById
} from '~/src/api/forms/repositories/helpers.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import { DEFINITION_COLLECTION_NAME, db } from '~/src/mongo.js'

const logger = createLogger()

/**
 * Adds a form to the Form Store
 * @param {string} id - id
 * @param {FormDefinition} formDefinition - form definition (JSON object)
 * @param {ClientSession} session - mongo transaction session
 * @param {ObjectSchema<FormDefinition>} schema - the schema to use
 */
export async function insert(id, formDefinition, session, schema) {
  logger.info(`Inserting form for form ID ${id}`)

  await insertDraft(id, formDefinition, session, schema)

  logger.info(`Inserted form for form ID ${id}`)
}

/**
 * Update a form in the Form Store
 * @param {string} id - id
 * @param {FormDefinition} formDefinition - form definition (JSON object)
 * @param {ClientSession} session - mongo transaction session
 * @param {ObjectSchema<FormDefinition>} schema - the schema to use
 * @returns {Promise<FormDefinition>}
 */
export async function update(id, formDefinition, session, schema) {
  logger.info(`Updating form for form ID ${id}`)

  const updateResult = await modifyDraft(id, () => formDefinition, session, schema)

  logger.info(`Updated form for form ID ${id}`)

  return updateResult.draft
}

/**
 * Copy the draft form to live in the Form Store
 * @param {string} id - id
 * @param {ClientSession} session - mongo transaction session
 */
export async function createLiveFromDraft(id, session) {
  logger.info(`Copying form definition (draft to live) for form ID ${id}`)

  const coll = /** @satisfies {Collection<{draft: FormDefinition}>} */ (db.collection(DEFINITION_COLLECTION_NAME))

  await coll.updateOne({ _id: new ObjectId(id) }, [{ $set: { live: '$draft' } }], { session })

  logger.info(`Copied form definition (draft to live) for form ID ${id}`)
}

/**
 * Copy the live form to draft in the Form Store
 * @param {string} id - id
 * @param {ClientSession} session - mongo transaction session
 */
export async function createDraftFromLive(id, session) {
  logger.info(`Copying form definition (live to draft) for form ID ${id}`)

  try {
    const coll = /** @satisfies {Collection<{draft: FormDefinition}>} */ (db.collection(DEFINITION_COLLECTION_NAME))

    await coll.updateOne({ _id: new ObjectId(id) }, [{ $set: { draft: '$live' } }], { session })
  } catch (err) {
    logger.error(
      err,
      `[createDraftFromLive] Failed to copy form definition (live to draft) for form ID ${id} - ${getErrorMessage(err)}`
    )

    if (err instanceof Error && !Boom.isBoom(err)) {
      throw Boom.internal(err)
    }

    throw err
  }

  logger.info(`Copied form definition (live to draft) for form ID ${id}`)
}

/**
 * Retrieves the form definition for a given form ID
 * @param {string} formId - the ID of the form
 * @param {FormStatus} state - the form state
 * @param {ClientSession | undefined} [session]
 * @returns {Promise<FormDefinition>}
 */
export async function get(formId, state = FormStatus.Draft, session) {
  logger.info(`Getting form definition (${state}) for form ID ${formId}`)

  const coll = /** @satisfies {Collection<{draft?: FormDefinition, live?: FormDefinition}>} */ (
    db.collection(DEFINITION_COLLECTION_NAME)
  )
  const sessionOptions = /** @type {FindOptions} */ session && { session }
  const options = /** @type {FindOptions} */ ({
    projection: { [state]: 1 },
    ...sessionOptions
  })

  try {
    const result = await coll.findOne({ _id: new ObjectId(formId) }, options)

    if (!result?.[state]) {
      throw Boom.notFound(`Form definition with ID '${formId}' not found`)
    }

    const definition = /** @type {FormDefinition} */ result[state]

    logger.info(`Got form definition (${state}) for form ID ${formId}`)

    return definition
  } catch (err) {
    logger.error(err, `[get] Failed to get form definition (${state}) for form ID ${formId} - ${getErrorMessage(err)}`)

    if (err instanceof Error && !Boom.isBoom(err)) {
      throw Boom.internal(err)
    }

    throw err
  }
}

/**
 * Removes a form definition
 * @param {string} formId - the ID of the form
 * @param {ClientSession} session
 */
export async function remove(formId, session) {
  logger.info(`Removing form definition with ID ${formId}`)

  await removeById(session, DEFINITION_COLLECTION_NAME, formId)

  logger.info(`Removed form definition with ID ${formId}`)
}

/**
 * Updates the engine version of a draft form definition
 * @param {string} formId - the ID of the form
 * @param {Engine} engineVersion - the engine version e.g. 'V1' or 'V2'
 * @param {ClientSession} session
 * @returns {Promise<FormDefinition>}
 */
export async function setEngineVersion(formId, engineVersion, session) {
  logger.info(`Updating engine version to ${engineVersion} for form ID ${formId}`)

  /** @type {UpdateCallback} */
  const callback = (draft) => modifyEngineVersion(draft, engineVersion)

  const result = await modifyDraft(formId, callback, session)

  logger.info(`Updated engine version to ${engineVersion} for form ID ${formId}`)

  return result.draft
}

/**
 * Updates the name of a draft form definition
 * @param {string} formId - the ID of the form
 * @param {string} name - new name for the form
 * @param {ClientSession} session
 * @param {ObjectSchema<FormDefinition>} schema - the schema to use
 * @returns {Promise<FormDefinition>}
 */
export async function updateName(formId, name, session, schema) {
  logger.info(`Updating form name for form ID ${formId}`)

  /** @type {UpdateCallback} */
  const callback = (draft) => modifyName(draft, name)

  const result = await modifyDraft(formId, callback, session, schema)

  logger.info(`Updated form name for form ID ${formId}`)

  return result.draft
}

/**
 * Removes pages that match the predicate
 * @param {string} formId - the ID of the form
 * @param {RemovePagePredicate} predicate
 * @param {ClientSession} session
 * @returns {Promise<FormDefinition>}
 */
export async function deletePages(formId, predicate, session) {
  logger.info(`Removing page on ${formId}`)

  /** @type {UpdateCallback} */
  const callback = (draft) => modifyDeletePages(draft, predicate)

  const result = await modifyDraft(formId, callback, session)

  logger.info(`Removed page on ${formId}`)

  return result.draft
}

/**
 * Add a new page
 * @param {string} formId - the ID of the form
 * @param {Page} page - the new page
 * @param {ClientSession} session
 * @returns {Promise<FormDefinition>}
 */
export async function addPage(formId, page, session) {
  logger.info(`Adding page on form ID ${formId}`)

  /** @type {UpdateCallback} */
  const callback = (draft) => modifyAddPage(draft, page, getPageInsertPosition(draft))

  const result = await modifyDraft(formId, callback, session)

  logger.info(`Added page on form ID ${formId}`)

  return result.draft
}

/**
 * Updates a page with specific page id
 * @param {string} formId
 * @param {string} pageId
 * @param {Page} page
 * @param {ClientSession} session
 * @returns {Promise<FormDefinition>}
 */
export async function updatePage(formId, pageId, page, session) {
  logger.info(`Updating page ID ${pageId} on form ID ${formId}`)

  /** @type {UpdateCallback} */
  const callback = (draft) => modifyUpdatePage(draft, page, pageId)

  const result = await modifyDraft(formId, callback, session)

  logger.info(`Updated page ID ${pageId} on form ID ${formId}`)

  return result.draft
}

/**
 * Reorders the pages
 * @param {string} formId
 * @param {string[]} order
 * @param {ClientSession} session
 * @returns {Promise<FormDefinition>}
 */
export async function reorderPages(formId, order, session) {
  logger.info(`Reordering pages on form ID ${formId}`)

  /** @type {UpdateCallback} */
  const callback = (draft) => modifyReorderPages(draft, order)

  const result = await modifyDraft(formId, callback, session)

  logger.info(`Reordered pages on form ID ${formId}`)

  return result.draft
}

/**
 * Reorders the components on a page
 * @param {string} formId
 * @param {string} pageId
 * @param {string[]} order
 * @param {ClientSession} session
 * @returns {Promise<FormDefinition>}
 */
export async function reorderComponents(formId, pageId, order, session) {
  logger.info(`Reordering components on form ID ${formId} page ID ${pageId}`)

  /** @type {UpdateCallback} */
  const callback = (draft) => modifyReorderComponents(draft, pageId, order)

  const result = await modifyDraft(formId, callback, session)

  logger.info(`Reordered components on form ID ${formId} page ID ${pageId}`)

  return result.draft
}

/**
 * Adds a new component to the page components array
 * @param {string} formId
 * @param {string} pageId
 * @param {ComponentDef} component
 * @param {ClientSession} session
 * @param {number | undefined} [position]
 * @returns {Promise<FormDefinition>}
 */
export async function addComponent(formId, pageId, component, session, position) {
  logger.info(`Adding a new component to form ID ${formId}`)

  /** @type {UpdateCallback} */
  const callback = (draft) => modifyAddComponent(draft, pageId, component, position)

  const result = await modifyDraft(formId, callback, session)

  logger.info(`Added a new component to form ID ${formId}`)

  return result.draft
}

/**
 * Updates a component with component id
 * @param {string} formId
 * @param {string} pageId
 * @param {string} componentId
 * @param {ComponentDef} component
 * @param {ClientSession} session
 */
export async function updateComponent(formId, pageId, componentId, component, session) {
  logger.info(`Updating component ID ${componentId} on page ID ${pageId} and form ID ${formId}`)

  /** @type {UpdateCallback} */
  const callback = (draft) => modifyUpdateComponent(draft, pageId, componentId, component)

  const updateResult = await modifyDraft(formId, callback, session)

  logger.info(`Updated component ID ${componentId} on page ID ${pageId} and form ID ${formId}`)

  return getComponent(updateResult.draft, pageId, componentId)
}

/**
 * Deletes a component with component id
 * @param {string} formId
 * @param {string} pageId
 * @param {string} componentId
 * @param {ClientSession} session
 * @returns {Promise<FormDefinition>}
 */
export async function deleteComponent(formId, pageId, componentId, session) {
  logger.info(`Deleting component ID ${componentId} on page ID ${pageId} and form ID ${formId}`)

  /** @type {UpdateCallback} */
  const callback = (draft) => modifyDeleteComponent(draft, pageId, componentId)

  const result = await modifyDraft(formId, callback, session)

  logger.info(`Deleted component ID ${componentId} on page ID ${pageId} and form ID ${formId}`)

  return result.draft
}

/**
 * Repository method to patch fields on a page - such as title
 * @param {string} formId
 * @param {string} pageId
 * @param {PatchPageFields} pageFields
 * @param {ClientSession} session
 * @returns {Promise<FormDefinition>}
 */
export async function updatePageFields(formId, pageId, pageFields, session) {
  const pageFieldKeys = Object.keys(pageFields)

  logger.info(`Updating page fields ${pageFieldKeys.toString()} on page ID ${pageId} and form ID ${formId}`)

  /** @type {UpdateCallback} */
  const callback = (draft) => modifyUpdatePageFields(draft, pageId, pageFields)

  const result = await modifyDraft(formId, callback, session)

  logger.info(`Updated page fields ${pageFieldKeys.toString()} on page ID ${pageId} and form ID ${formId}`)

  return result.draft
}

/**
 * Deletes a page with page id
 * @param {string} formId
 * @param {string} pageId
 * @param {ClientSession} session
 * @returns {Promise<FormDefinition>}
 */
export async function deletePage(formId, pageId, session) {
  logger.info(`Deleting page ID ${pageId} on form ID ${formId}`)

  /** @type {UpdateCallback} */
  const callback = (draft) => modifyDeletePage(draft, pageId)

  const result = await modifyDraft(formId, callback, session)

  logger.info(`Deleted page ID ${pageId} on form ID ${formId}`)

  return result.draft
}

/**
 * Adds a new list
 * @param {string} formId
 * @param {List} list
 * @param {ClientSession} session
 */
export async function addList(formId, list, session) {
  logger.info(`Adding new lists to form ID ${formId}`)

  /** @type {UpdateCallback} */
  const callback = (draft) => modifyAddList(draft, list)

  const result = await modifyDraft(formId, callback, session)

  logger.info(`Added new list to form ID ${formId}`)

  const lists = result.draft.lists

  return lists[lists.length - 1]
}

/**
 * Updates a list by id
 * @param {string} formId
 * @param {string} listId
 * @param {List} list
 * @param {ClientSession} session
 * @returns {Promise<List>}
 */
export async function updateList(formId, listId, list, session) {
  logger.info(`Updating list with ID ${listId} on form ID ${formId}`)

  /** @type {UpdateCallback} */
  const callback = (draft) => modifyUpdateList(draft, listId, list)

  const result = await modifyDraft(formId, callback, session)

  logger.info(`Updated list with ID ${listId} on form ID ${formId}`)

  return getList(result.draft, listId)
}

/**
 * Removes a list by id
 * @param {string} formId
 * @param {string} listId
 * @param {ClientSession} session
 * @returns {Promise<FormDefinition>}
 */
export async function deleteList(formId, listId, session) {
  logger.info(`Deleting list ID ${listId} on form ID ${formId}`)

  /** @type {UpdateCallback} */
  const callback = (draft) => modifyDeleteList(draft, listId)

  const result = await modifyDraft(formId, callback, session)

  logger.info(`Deleted list ID ${listId} on form ID ${formId}`)

  return result.draft
}

/**
 * Adds a new condition
 * @param {string} formId
 * @param {ConditionWrapperV2} condition
 * @param {ClientSession} session
 */
export async function addCondition(formId, condition, session) {
  logger.info(`Adding new condition to form ID ${formId}`)

  /** @type {UpdateCallback} */
  const callback = (draft) => modifyAddCondition(draft, condition)

  const result = await modifyDraft(formId, callback, session)

  logger.info(`Added new condition to form ID ${formId}`)

  return getCondition(result.draft, condition.id)
}

/**
 * Updates a condition by id
 * @param {string} formId
 * @param {string} conditionId
 * @param {ConditionWrapperV2} condition
 * @param {ClientSession} session
 * @returns {Promise<ConditionWrapperV2>}
 */
export async function updateCondition(formId, conditionId, condition, session) {
  logger.info(`Updating condition with ID ${conditionId} on form ID ${formId}`)

  /** @type {UpdateCallback} */
  const callback = (draft) => modifyUpdateCondition(draft, conditionId, condition)

  const result = await modifyDraft(formId, callback, session)

  logger.info(`Updated condition with ID ${conditionId} on form ID ${formId}`)

  return getCondition(result.draft, conditionId)
}

/**
 * Removes a condition by id and unassigns it from any pages that use it
 * @param {string} formId
 * @param {string} conditionId
 * @param {ClientSession} session
 * @returns {Promise<FormDefinition>}
 */
export async function deleteCondition(formId, conditionId, session) {
  logger.info(`Deleting condition ID ${conditionId} on form ID ${formId}`)

  /** @type {UpdateCallback} */
  const callback = (draft) => {
    modifyUnassignCondition(draft, conditionId)

    return modifyDeleteCondition(draft, conditionId)
  }

  const result = await modifyDraft(formId, callback, session)

  logger.info(`Deleted condition ID ${conditionId} on form ID ${formId}`)

  return result.draft
}

/**
 * Insert or update a document in the database
 * @param {string} formId - the id of the form
 * @param {{draft: FormDefinition, live: FormDefinition}} document - form metadata document update filter
 * @param {ClientSession} [session] - mongo transaction session
 */
export async function upsertDraftAndLive(formId, document, session) {
  const coll = /** @satisfies {Collection<{draft: FormDefinition, live: FormDefinition}>} */ (
    db.collection(DEFINITION_COLLECTION_NAME)
  )

  try {
    const result = await coll.updateOne({ _id: new ObjectId(formId) }, { $set: document }, { session, upsert: true })

    return result
  } catch (err) {
    logger.error(err, `[upsertFormDefinition] Updating form with ID ${formId} failed - ${getErrorMessage(err)}`)

    if (err instanceof Error && !Boom.isBoom(err)) {
      throw Boom.internal(err)
    }

    throw err
  }
}

/**
 * Assigns sections to pages in the form definition
 * @param {string} formId
 * @param {SectionAssignmentItem[]} sectionAssignments
 * @param {ClientSession} session
 * @returns {Promise<SectionAssignmentItem[]>}
 */
export async function assignSections(formId, sectionAssignments, session) {
  logger.info(`Assigning sections on form ID ${formId}`)

  /** @type {UpdateCallback} */
  const callback = (draft) => modifyAssignSections(draft, sectionAssignments)

  const result = await modifyDraft(formId, callback, session)

  logger.info(`Assigned sections on form ID ${formId}`)

  return buildSectionsResponse(result.draft)
}

/**
 * Updates a draft form definition
 * @param {string} formId - the form id
 * @param {ClientSession} session - the mongo transaction session
 */
export async function deleteDraft(formId, session) {
  // Delete the draft
  const col = /** @satisfies {Collection<{draft: FormDefinition}>} */ (db.collection(DEFINITION_COLLECTION_NAME))

  const updateResult = await col.updateOne({ _id: new ObjectId(formId) }, { $unset: { draft: '' } }, { session })

  if (updateResult.matchedCount === 0) {
    throw Boom.notFound(`Document not found '${formId}'`)
  }

  if (updateResult.modifiedCount === 0) {
    throw Boom.notFound(`Draft not found in document '${formId}'`)
  }

  return updateResult
}

/**
 * Adds or updates an option
 * @param {string} formId
 * @param {string} optionName
 * @param {string} optionValue
 * @param {ClientSession} session
 * @returns {Promise<FormDefinition>}
 */
export async function updateOption(formId, optionName, optionValue, session) {
  /** @type {UpdateCallback} */
  const callback = (draft) => modifyUpdateOption(draft, optionName, optionValue)

  const result = await modifyDraft(formId, callback, session)

  return result.draft
}

/**
 * @import { FormDefinition, Page, ComponentDef, PatchPageFields, List, Engine, ConditionWrapperV2, SectionAssignmentItem } from '@defra/forms-model'
 * @import { ClientSession, Collection, FindOptions } from 'mongodb'
 * @import { ObjectSchema } from 'joi'
 * @import { UpdateCallback, RemovePagePredicate } from '~/src/api/forms/repositories/helpers.js'
 */
