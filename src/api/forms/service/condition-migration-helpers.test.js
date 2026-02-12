import { ComponentType, ConditionType, Coordinator, DateDirections, DateUnits, OperatorName } from '@defra/forms-model'

import {
  convertConditionDataToV2,
  extractRelativeDateValue,
  findComponentAcrossPages,
  isConditionData,
  isConditionValueData,
  relativeDateValueToString
} from '~/src/api/forms/service/condition-migration-helpers.js'

/**
 * @type {ConditionData}
 */
const conditionDataString = {
  field: {
    name: 'field1',
    type: ComponentType.TextField,
    display: 'dummy'
  },
  operator: OperatorName.Is,
  value: {
    type: ConditionType.Value,
    value: 'test-value',
    display: 'foobar'
  }
}

/**
 * @type {ConditionData}
 */
const conditionDataStringWithNumericOperator = {
  field: {
    name: 'field1',
    type: ComponentType.TextField,
    display: 'dummy'
  },
  operator: OperatorName.HasLength,
  value: {
    type: ConditionType.Value,
    value: '20',
    display: 'foobar'
  }
}

/**
 * @type {ConditionData}
 */
const conditionDataEmailWithNumericOperator = {
  field: {
    name: 'field1',
    type: ComponentType.EmailAddressField,
    display: 'dummy'
  },
  operator: OperatorName.IsLongerThan,
  value: {
    type: ConditionType.Value,
    value: '15',
    display: 'foobar'
  }
}

/**
 * @type {ConditionData}
 */
const conditionDataNumber = {
  field: {
    name: 'field1',
    type: ComponentType.NumberField,
    display: 'dummy'
  },
  operator: OperatorName.Is,
  value: {
    type: ConditionType.Value,
    value: '5',
    display: 'foobar'
  }
}

/**
 * @type {ConditionData}
 */
const conditionDataBooleanTrue = {
  field: {
    name: 'field1',
    type: ComponentType.YesNoField,
    display: 'dummy'
  },
  operator: OperatorName.Is,
  value: {
    type: ConditionType.Value,
    value: 'true',
    display: 'foobar'
  }
}

/**
 * @type {ConditionData}
 */
const conditionDataBooleanFalse = {
  field: {
    name: 'field1',
    type: ComponentType.YesNoField,
    display: 'dummy'
  },
  operator: OperatorName.Is,
  value: {
    type: ConditionType.Value,
    value: 'false',
    display: 'foobar'
  }
}

/**
 * @type {ConditionData}
 */
const conditionDataRelativeDate = {
  field: {
    name: 'field1',
    type: ComponentType.DatePartsField,
    display: 'dummy'
  },
  operator: OperatorName.IsAtLeast,
  value: {
    direction: DateDirections.FUTURE,
    unit: DateUnits.DAYS,
    period: '15',
    type: ConditionType.RelativeDate
  }
}

/**
 * @type {ConditionData}
 */
const conditionDataListItemRef = {
  field: {
    name: 'radios',
    type: ComponentType.RadiosField,
    display: 'dummy'
  },
  operator: OperatorName.Is,
  value: {
    type: ConditionType.Value,
    value: 'opt2',
    display: 'foobar'
  }
}

const dummyDefinition = /** @type {FormDefinition} */ ({
  pages: [
    {
      components: [
        {
          id: 'comp1',
          type: ComponentType.RadiosField,
          name: 'radios',
          list: 'listId'
        }
      ]
    }
  ],
  lists: [
    {
      id: 'listId',
      name: 'listName',
      title: 'list',
      type: 'string',
      items: [
        { text: 'Option 1', value: 'opt1', id: 'id1' },
        { text: 'Option 2', value: 'opt2', id: 'id2' },
        { text: 'Option 3', value: 'opt3', id: 'id3' }
      ]
    }
  ]
})

describe('convertConditionDataToV2', () => {
  it('converts a valid conditionData when componentId exists - string value', () => {
    const fieldNameToComponentId = new Map([['field1', 'component-123']])
    const usedConditions = new Set()
    const result = convertConditionDataToV2(
      conditionDataString,
      fieldNameToComponentId,
      usedConditions,
      dummyDefinition
    )
    expect(result).toEqual({
      id: expect.any(String),
      componentId: 'component-123',
      operator: 'is',
      type: ConditionType.StringValue,
      value: 'test-value'
    })
  })

  it('converts a valid conditionData when componentId exists - boolean value true', () => {
    const fieldNameToComponentId = new Map([['field1', 'component-123']])
    const usedConditions = new Set()
    const result = convertConditionDataToV2(
      conditionDataBooleanTrue,
      fieldNameToComponentId,
      usedConditions,
      dummyDefinition
    )
    expect(result).toEqual({
      id: expect.any(String),
      componentId: 'component-123',
      operator: 'is',
      type: ConditionType.BooleanValue,
      value: true
    })
  })

  it('converts a valid conditionData when componentId exists - boolean value false', () => {
    const fieldNameToComponentId = new Map([['field1', 'component-123']])
    const usedConditions = new Set()
    const result = convertConditionDataToV2(
      conditionDataBooleanFalse,
      fieldNameToComponentId,
      usedConditions,
      dummyDefinition
    )
    expect(result).toEqual({
      id: expect.any(String),
      componentId: 'component-123',
      operator: 'is',
      type: ConditionType.BooleanValue,
      value: false
    })
  })

  it('converts a valid conditionData when componentId exists - number value', () => {
    const fieldNameToComponentId = new Map([['field1', 'component-123']])
    const usedConditions = new Set()
    const result = convertConditionDataToV2(
      conditionDataNumber,
      fieldNameToComponentId,
      usedConditions,
      dummyDefinition
    )
    expect(result).toEqual({
      id: expect.any(String),
      componentId: 'component-123',
      operator: 'is',
      type: ConditionType.NumberValue,
      value: 5
    })
  })

  it('converts a valid conditionData when componentId exists - relative date value', () => {
    const fieldNameToComponentId = new Map([['field1', 'component-123']])
    const usedConditions = new Set()
    const result = convertConditionDataToV2(
      conditionDataRelativeDate,
      fieldNameToComponentId,
      usedConditions,
      dummyDefinition
    )
    expect(result).toEqual({
      id: expect.any(String),
      componentId: 'component-123',
      operator: 'is at least',
      type: ConditionType.RelativeDate,
      value: {
        direction: 'in the future',
        unit: 'days',
        period: 15
      }
    })
  })

  it('converts a valid conditionData when componentId exists - list item ref value', () => {
    const fieldNameToComponentId = new Map([['radios', 'listId']])
    const usedConditions = new Set()
    const result = convertConditionDataToV2(
      conditionDataListItemRef,
      fieldNameToComponentId,
      usedConditions,
      dummyDefinition
    )
    expect(result).toEqual({
      id: expect.any(String),
      componentId: 'listId',
      operator: 'is',
      type: ConditionType.ListItemRef,
      value: {
        listId: 'listId',
        itemId: 'id2'
      }
    })
  })

  it('converts a valid conditionData for string value when operator denotes numeric value - textfield', () => {
    const fieldNameToComponentId = new Map([['field1', 'component-123']])
    const usedConditions = new Set()
    const result = convertConditionDataToV2(
      conditionDataStringWithNumericOperator,
      fieldNameToComponentId,
      usedConditions,
      dummyDefinition
    )
    expect(result).toEqual({
      id: expect.any(String),
      componentId: 'component-123',
      operator: 'has length',
      type: ConditionType.NumberValue,
      value: 20
    })
  })

  it('converts a valid conditionData for string value when operator denotes numeric value - emailaddressfield', () => {
    const fieldNameToComponentId = new Map([['field1', 'component-123']])
    const usedConditions = new Set()
    const result = convertConditionDataToV2(
      conditionDataEmailWithNumericOperator,
      fieldNameToComponentId,
      usedConditions,
      dummyDefinition
    )
    expect(result).toEqual({
      id: expect.any(String),
      componentId: 'component-123',
      operator: 'is longer than',
      type: ConditionType.NumberValue,
      value: 15
    })
  })

  it('throws if conditionData.value.type is not ConditionType.Value', () => {
    const fieldNameToComponentId = new Map()
    const usedConditions = new Set()

    /**
     * @type {ConditionData}
     */
    const invalidConditionData = {
      ...conditionDataString,
      // @ts-expect-error -- we're deliberately testing the type guard
      value: { type: 'OtherType', value: 'abc' }
    }
    expect(() =>
      convertConditionDataToV2(invalidConditionData, fieldNameToComponentId, usedConditions, dummyDefinition)
    ).toThrow('Unsupported condition value type found: OtherType')
  })

  it('throws if componentId does not exist but field is in use', () => {
    const fieldNameToComponentId = new Map()
    const usedConditions = new Set(['field1'])
    expect(() =>
      convertConditionDataToV2(conditionDataString, fieldNameToComponentId, usedConditions, dummyDefinition)
    ).toThrow("Cannot migrate condition: field name 'field1' not found in components but is in use.")
  })

  it('returns null if componentId does not exist and field is not in use', () => {
    const fieldNameToComponentId = new Map()
    const usedConditions = new Set()
    const result = convertConditionDataToV2(
      conditionDataString,
      fieldNameToComponentId,
      usedConditions,
      dummyDefinition
    )
    expect(result).toBeNull()
  })
})

describe('isConditionValueData', () => {
  it('returns true for a valid ConditionValueData object', () => {
    const value = { type: ConditionType.Value, value: 'abc' }
    expect(isConditionValueData(value)).toBe(true)
  })

  it('returns false if type is not ConditionType.Value', () => {
    const value = { type: 'OtherType', value: 'abc' }
    expect(isConditionValueData(value)).toBe(false)
  })

  it('returns false if type property is missing', () => {
    const value = { value: 'abc' }
    expect(isConditionValueData(value)).toBe(false)
  })

  it('returns false if object is empty', () => {
    expect(isConditionValueData({})).toBe(false)
  })
})

describe('isConditionData', () => {
  it('returns true for a valid ConditionData object', () => {
    expect(isConditionData(conditionDataString)).toBe(true)
  })

  it('returns false for a valid ConditionGroupData object', () => {
    /**
     * @type {ConditionRefData}
     */
    const conditionGroupData = {
      conditionDisplayName: 'Group Condition',
      conditionName: 'group-condition',
      coordinator: Coordinator.AND
    }

    expect(isConditionData(conditionGroupData)).toBe(false)
  })

  describe('relativeDateValueToString', () => {
    it('should display object contents if present', () => {
      const dateObj = /** @type {RelativeDateValueData} */ ({
        period: 'period',
        unit: 'days',
        direction: 'in the past'
      })
      expect(relativeDateValueToString(dateObj)).toBe('period: period unit: days direction: in the past')
    })

    it('should display object contents when not present', () => {
      const dateObj = {
        period: undefined,
        unit: undefined,
        direction: undefined
      }
      // @ts-expect-error - undeterministic type for test
      expect(relativeDateValueToString(dateObj)).toBe('period: undefined unit: undefined direction: undefined')
    })

    it('should display object contents when empty object', () => {
      const dateObj = {}
      // @ts-expect-error - undeterministic type for test
      expect(relativeDateValueToString(dateObj)).toBe('period:  unit:  direction: ')
    })
  })

  describe('extractRelativeDateValue', () => {
    it('should throw if not relative date type', () => {
      const data = { type: ConditionType.RelativeDate }
      // @ts-expect-error - undeterministic type for test
      expect(() => extractRelativeDateValue(data)).toThrow(
        'Missing values in condition value for relative date: period:  unit:  direction: '
      )
    })

    it('should throw if period is empty', () => {
      const data = {
        value: {
          unit: 'days',
          direction: 'in the future',
          period: '',
          type: ConditionType.RelativeDate
        }
      }
      // @ts-expect-error - undeterministic type for test
      expect(() => extractRelativeDateValue(data)).toThrow(
        'Missing period value in condition value for relative date: period:  unit: days direction: in the future'
      )
    })

    it('should return object if valid contents', () => {
      const data = {
        value: {
          unit: 'days',
          direction: 'in the future',
          period: '15',
          type: ConditionType.RelativeDate
        }
      }
      // @ts-expect-error - undeterministic type for test
      expect(extractRelativeDateValue(data)).toEqual({
        period: 15,
        unit: 'days',
        direction: 'in the future'
      })
    })
  })

  describe('findComponentAcrossPages', () => {
    it('should find component', () => {
      expect(findComponentAcrossPages(dummyDefinition, 'radios')).toBeDefined()
    })

    it('should throw if not found', () => {
      expect(() => findComponentAcrossPages(dummyDefinition, 'unknown')).toThrow(
        'Component of name unknown not found in definition'
      )
    })
  })
})

/**
 * @import { ConditionData, ConditionRefData, FormDefinition, RelativeDateValueData } from '@defra/forms-model'
 */
