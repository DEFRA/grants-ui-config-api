import { ComponentType, ControllerPath, ControllerType } from '@defra/forms-model'

import { empty } from '~/src/api/forms/templates.js'

/**
 * @param {Partial<PageQuestion>} [partialPage]
 * @returns {PageQuestion}
 */
export function buildQuestionPage(partialPage = {}) {
  return /** @type {PageQuestion} */ (
    structuredClone({
      id: 'ffefd409-f3f4-49fe-882e-6e89f44631b1',
      title: 'Page One',
      path: '/page-one',
      next: [],
      components: [],
      ...partialPage
    })
  )
}

/**
 * @param {Partial<PageSummary>} [partialSummaryPage]
 */
export function buildSummaryPage(partialSummaryPage = {}) {
  /** @type {PageSummary} */
  const page = /** @satisfies {PageSummary} */ (
    structuredClone({
      id: '449a45f6-4541-4a46-91bd-8b8931b07b50',
      title: 'Summary',
      path: ControllerPath.Summary,
      controller: ControllerType.Summary,
      ...partialSummaryPage
    })
  )
  return page
}

/**
 * @param {Partial<PageSummaryWithConfirmationEmail>} [partialSummaryPage]
 */
export function buildSummaryPageWithConfirmation(partialSummaryPage = {}) {
  /** @type {PageSummaryWithConfirmationEmail } */
  const page = /** @satisfies {PageSummaryWithConfirmationEmail} */ (
    structuredClone({
      id: '449a45f6-4541-4a46-91bd-8b8931b07b50',
      title: 'Summary',
      path: ControllerPath.Summary,
      controller: ControllerType.SummaryWithConfirmationEmail,
      ...partialSummaryPage
    })
  )
  return page
}

/**
 * @param {Partial<PageStatus>} partialStatusPage
 */
export function buildStatusPage(partialStatusPage = {}) {
  return /** @type {PageStatus} */ (
    structuredClone({
      id: '38a2946b-78d9-4b94-9a31-4aa979ce2a89',
      title: 'Status',
      path: ControllerPath.Status,
      controller: ControllerType.Status,
      ...partialStatusPage
    })
  )
}

/**
 * Builds a form definition
 * @param {Partial<FormDefinition>} partialDefinition
 * @returns {FormDefinition}
 */
export function buildDefinition(partialDefinition) {
  const emptyDefinition = empty()
  return /** @type {FormDefinition} */ (
    structuredClone({
      ...emptyDefinition,
      ...partialDefinition
    })
  )
}

/**
 * @param {Partial<Item>} partialListItem
 * @returns {Item}
 */
export function buildListItem(partialListItem = {}) {
  return /** @type {Item} */ (
    structuredClone({
      value: 'item',
      text: 'Item',
      ...partialListItem
    })
  )
}

/**
 * @param {string} value
 * @returns {Item}
 */
export function buildDefaultListItem(value) {
  const [head, ...tail] = value
  return {
    value,
    text: [head.toUpperCase(), ...tail].join('')
  }
}

/**
 * @param {Partial<List>} partialList
 * @returns {List}
 */
export function buildList(partialList = {}) {
  return /** @type {List} */ (
    structuredClone({
      items: [],
      name: 'YhmNDL',
      title: 'String List',
      type: 'string',
      ...partialList
    })
  )
}

/**
 * @param {Partial<ConditionWrapperV2>} partialCondition
 * @returns {ConditionWrapperV2}
 */
export function buildCondition(partialCondition = {}) {
  return /** @type {ConditionWrapperV2} */ (
    structuredClone({
      id: '00000000-0000-0000-0000-000000000000',
      displayName: 'Condition wrapper',
      coordinator: undefined,
      items: [],
      ...partialCondition
    })
  )
}

/**
 * @param {Partial<TextFieldComponent>} partialTextField
 * @returns {TextFieldComponent}
 */
export function buildTextFieldComponent(partialTextField = {}) {
  return /** @satisfies {TextFieldComponent} */ (
    structuredClone({
      id: '407dd0d7-cce9-4f43-8e1f-7d89cb698875',
      name: 'TextField',
      shortDescription: 'Text field',
      title: 'Text field',
      type: ComponentType.TextField,
      hint: '',
      options: {},
      schema: {},
      ...partialTextField
    })
  )
}
/**
 * @import { FormDefinition, PageSummary, PageSummaryWithConfirmationEmail, PageQuestion, PageStatus, TextFieldComponent, Item, List, ConditionWrapperV2 } from '@defra/forms-model'
 */
