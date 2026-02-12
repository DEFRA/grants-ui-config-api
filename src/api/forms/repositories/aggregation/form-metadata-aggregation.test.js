import { FormStatus } from '@defra/forms-model'

import {
  addDateFieldStage,
  addRankingStage,
  addSortingStage,
  addVersionsLookupStage,
  buildAggregationPipeline,
  buildAggregationPipelineWithVersions,
  buildFilterConditions,
  buildFiltersFacet,
  processAuthorNames,
  processFilterResults
} from '~/src/api/forms/repositories/aggregation/form-metadata-aggregation.js'

describe('Form metadata aggregation', () => {
  /** @type {PipelineStage[]} */
  let pipeline

  beforeEach(() => {
    pipeline = []
  })

  describe('buildFilterConditions', () => {
    describe('with empty options', () => {
      it('should return empty conditions', () => {
        const result = buildFilterConditions({})
        expect(result).toEqual({})
      })
    })

    describe('with title filter', () => {
      it('should create case-insensitive regex filter', () => {
        const result = buildFilterConditions({ title: 'Test Form' })
        expect(result).toEqual({
          title: { $regex: /Test Form/i }
        })
      })
    })

    describe('with author filter', () => {
      it('should create author name filter', () => {
        const result = buildFilterConditions({ author: 'John Doe' })
        expect(result).toEqual({
          'createdBy.displayName': { $regex: /John Doe/i }
        })
      })
    })

    describe('with organisations filter', () => {
      it('should create organisations filter', () => {
        const result = buildFilterConditions({
          organisations: ['Natural England', 'Defra']
        })
        expect(result).toEqual({
          organisation: { $in: ['Natural England', 'Defra'] }
        })
      })
    })

    describe('with status filter', () => {
      it('should create status filter for live forms', () => {
        const result = buildFilterConditions({ status: [FormStatus.Live] })
        expect(result).toEqual({
          $or: [{ live: { $exists: true } }]
        })
      })

      it('should create status filter for draft forms', () => {
        const result = buildFilterConditions({ status: [FormStatus.Draft] })
        expect(result).toEqual({
          $or: [{ live: { $exists: false } }]
        })
      })
    })

    describe('with multiple status values', () => {
      it('should create combined status filter', () => {
        const result = buildFilterConditions({
          status: [FormStatus.Live, FormStatus.Draft]
        })
        expect(result).toEqual({
          $or: [{ live: { $exists: true } }, { live: { $exists: false } }]
        })
      })
    })

    describe('with combined filters', () => {
      it('should create filter with all conditions', () => {
        const result = buildFilterConditions({
          title: 'Wildlife Permit Application',
          author: 'Henrique Silva',
          organisations: ['Natural England', 'Defra'],
          status: [FormStatus.Live]
        })

        expect(result).toEqual({
          title: { $regex: /Wildlife Permit Application/i },
          'createdBy.displayName': { $regex: /Henrique Silva/i },
          organisation: { $in: ['Natural England', 'Defra'] },
          $or: [{ live: { $exists: true } }]
        })
      })
    })
  })

  describe('buildAggregationPipeline', () => {
    describe('without filters', () => {
      it('should build pipeline with default sorting', () => {
        const { pipeline, aggOptions } = buildAggregationPipeline('updatedAt', 'desc', '', '', [], [])

        expect(pipeline).toHaveLength(3) // ranking, date, and sort stages
        expect(aggOptions).toEqual({
          collation: { locale: 'en', strength: 1 }
        })
      })
    })

    describe('with multiple filters', () => {
      it('should include match stage and all filters', () => {
        const { pipeline } = buildAggregationPipeline(
          'updatedAt',
          'desc',
          'Wildlife Permit Application',
          'Henrique',
          ['Defra'],
          [FormStatus.Live]
        )

        expect(pipeline[0]).toHaveProperty('$match')
        expect(pipeline[0].$match).toEqual({
          title: { $regex: /Wildlife Permit Application/i },
          'createdBy.displayName': { $regex: /Henrique/i },
          organisation: { $in: ['Defra'] },
          $or: [{ live: { $exists: true } }]
        })
        expect(pipeline).toHaveLength(4) // match, ranking, date, and sort stages
      })
    })
  })

  describe('buildAggregationPipelineWithVersions', () => {
    describe('without filters', () => {
      it('should build pipeline with versions lookup and default sorting', () => {
        const { pipeline, aggOptions } = buildAggregationPipelineWithVersions('updatedAt', 'desc', '', '', [], [])

        expect(pipeline).toHaveLength(4) // ranking, date, sort, and versions lookup stages
        expect(aggOptions).toEqual({
          collation: { locale: 'en', strength: 1 }
        })

        const versionsLookupStage = pipeline[pipeline.length - 1]
        expect(versionsLookupStage).toHaveProperty('$lookup')
        expect(versionsLookupStage.$lookup).toEqual({
          from: 'form-versions',
          let: { formId: { $toString: '$_id' } },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$formId', '$$formId'] }
              }
            },
            {
              $project: {
                versionNumber: 1,
                createdAt: 1,
                _id: 0
              }
            },
            {
              $sort: { versionNumber: -1 }
            }
          ],
          as: 'versions'
        })
      })
    })

    describe('with multiple filters', () => {
      it('should include match stage, filters, and versions lookup', () => {
        const { pipeline } = buildAggregationPipelineWithVersions(
          'title',
          'asc',
          'Wildlife Permit Application',
          'Henrique',
          ['Defra'],
          [FormStatus.Live]
        )

        expect(pipeline[0]).toHaveProperty('$match')
        expect(pipeline[0].$match).toEqual({
          title: { $regex: /Wildlife Permit Application/i },
          'createdBy.displayName': { $regex: /Henrique/i },
          organisation: { $in: ['Defra'] },
          $or: [{ live: { $exists: true } }]
        })
        expect(pipeline).toHaveLength(5) // match, ranking, date, sort, and versions lookup stages

        const versionsLookupStage = pipeline[pipeline.length - 1]
        expect(versionsLookupStage).toHaveProperty('$lookup')
        expect(versionsLookupStage.$lookup?.from).toBe('form-versions')
      })
    })

    describe('with title sorting', () => {
      it('should build pipeline with title sort and versions lookup', () => {
        const { pipeline, aggOptions } = buildAggregationPipelineWithVersions('title', 'asc', 'Test Form', '', [], [])

        expect(pipeline).toHaveLength(5) // match, ranking, date, sort, and versions lookup stages
        expect(aggOptions).toEqual({
          collation: { locale: 'en', strength: 1 }
        })

        expect(pipeline[0]).toHaveProperty('$match')
        expect(pipeline[0].$match?.title).toEqual({ $regex: /Test Form/i })

        const sortStage = pipeline[pipeline.length - 2] // Second to last stage
        expect(sortStage.$sort).toEqual({
          title: 1,
          updatedDateOnly: -1,
          'updatedBy.displayName': 1
        })
      })
    })
  })

  describe('addVersionsLookupStage', () => {
    it('should add versions lookup stage to pipeline', () => {
      addVersionsLookupStage(pipeline)

      expect(pipeline).toHaveLength(1)
      expect(pipeline[0]).toEqual({
        $lookup: {
          from: 'form-versions',
          let: { formId: { $toString: '$_id' } },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$formId', '$$formId'] }
              }
            },
            {
              $project: {
                versionNumber: 1,
                createdAt: 1,
                _id: 0
              }
            },
            {
              $sort: { versionNumber: -1 }
            }
          ],
          as: 'versions'
        }
      })
    })

    it('should add versions lookup stage to existing pipeline', () => {
      pipeline.push({ $match: { title: { $regex: /test/i } } })
      pipeline.push({ $addFields: { testField: 1 } })

      addVersionsLookupStage(pipeline)

      expect(pipeline).toHaveLength(3)
      expect(pipeline[2]).toHaveProperty('$lookup')
      expect(pipeline[2].$lookup?.from).toBe('form-versions')
      expect(pipeline[2].$lookup?.as).toBe('versions')
    })

    it('should create proper lookup pipeline for form versions', () => {
      addVersionsLookupStage(pipeline)

      const lookupStage = pipeline[0].$lookup
      expect(lookupStage?.pipeline).toHaveLength(3)

      expect(lookupStage?.pipeline?.[0]).toEqual({
        $match: {
          $expr: { $eq: ['$formId', '$$formId'] }
        }
      })

      expect(lookupStage?.pipeline?.[1]).toEqual({
        $project: {
          versionNumber: 1,
          createdAt: 1,
          _id: 0
        }
      })

      expect(lookupStage?.pipeline?.[2]).toEqual({
        $sort: { versionNumber: -1 }
      })
    })

    it('should use correct variable binding for form ID', () => {
      addVersionsLookupStage(pipeline)

      const lookupStage = pipeline[0].$lookup
      expect(lookupStage?.let).toEqual({
        formId: { $toString: '$_id' }
      })
    })
  })

  describe('addRankingStage', () => {
    describe('without title', () => {
      it('should add default matchScore', () => {
        addRankingStage(pipeline, '')

        expect(pipeline).toHaveLength(1)
        expect(pipeline[0].$addFields).toEqual({
          matchScore: 0
        })
      })
    })

    describe('with title', () => {
      it('should add ranking logic', () => {
        addRankingStage(pipeline, 'Test Form')

        expect(pipeline).toHaveLength(1)
        const addFields = /** @type {PipelineStage} */ (pipeline[0])
        const matchScore = /** @type {AddFieldsSwitch} */ (addFields.$addFields?.matchScore)
        expect(matchScore).toHaveProperty('$switch')
        expect(matchScore.$switch.branches).toHaveLength(3)
      })
    })

    describe('with numeric title', () => {
      it('should handle numeric or mixed title gracefully', () => {
        addRankingStage(pipeline, '12345')
        const addFields = pipeline[0].$addFields
        expect(addFields?.matchScore).toBeDefined()
      })
    })
  })

  describe('addDateFieldStage', () => {
    it('should add date formatting stage', () => {
      addDateFieldStage(pipeline)

      expect(pipeline).toHaveLength(1)
      expect(pipeline[0].$addFields).toEqual({
        updatedDateOnly: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$updatedAt',
            timezone: 'UTC'
          }
        }
      })
    })
  })

  describe('addSortingStage', () => {
    describe('with title sort', () => {
      it('should add title sort with collation', () => {
        const collation = addSortingStage(pipeline, 'title', 'asc')

        expect(pipeline[0].$sort).toEqual({
          title: 1,
          updatedDateOnly: -1,
          'updatedBy.displayName': 1
        })
        expect(collation).toEqual({ locale: 'en', strength: 1 })
      })
    })

    describe('with updatedAt sort', () => {
      it('should add updatedAt sort', () => {
        const collation = addSortingStage(pipeline, 'updatedAt', 'desc')

        expect(pipeline[0].$sort).toEqual({
          updatedDateOnly: -1,
          'updatedBy.displayName': 1
        })
        expect(collation).toEqual({ locale: 'en', strength: 1 })
      })
    })

    describe('with unknown sort field', () => {
      it('should add default sort', () => {
        const collation = addSortingStage(pipeline, 'unknown', 'desc')

        expect(pipeline[0].$sort).toEqual({
          updatedDateOnly: -1,
          'updatedBy.displayName': 1
        })
        expect(collation).toEqual({ locale: 'en', strength: 1 })
      })
    })
  })

  describe('buildFiltersFacet', () => {
    it('should build facet pipeline with authors, organisations, and status groups', () => {
      const result = buildFiltersFacet()

      expect(result).toEqual({
        $facet: {
          authors: [
            {
              $group: {
                _id: '$createdBy.displayName'
              }
            },
            {
              $project: {
                _id: 0,
                name: '$_id'
              }
            },
            { $sort: { name: 1 } }
          ],
          organisations: [
            { $group: { _id: '$organisation' } },
            { $project: { name: '$_id', _id: 0 } },
            { $sort: { name: 1 } }
          ],
          status: [
            {
              $group: {
                _id: null,
                statuses: {
                  $addToSet: {
                    $cond: [{ $ifNull: ['$live', false] }, 'live', 'draft']
                  }
                }
              }
            },
            { $project: { statuses: 1, _id: 0 } }
          ]
        }
      })
    })
  })

  describe('processAuthorNames', () => {
    it('should filter out invalid author names', () => {
      const authors = [
        { name: 'Henrique Chase (Defra)' },
        { name: 'undefined undefined' },
        { name: 'Sarah Wilson (Natural England)' }
      ]

      const result = processAuthorNames(authors)

      expect(result).toEqual(['Henrique Chase (Defra)', 'Sarah Wilson (Natural England)'])
    })

    it('should handle empty array', () => {
      expect(processAuthorNames([])).toEqual([])
    })
  })

  describe('processFilterResults', () => {
    it('should process filter results into FilterOptions structure', () => {
      /** @type {FilterAggregationResult} */
      const filterResults = {
        authors: [
          { name: 'Enrique Chase (Defra)' },
          { name: 'undefined undefined' },
          { name: 'Sarah Wilson (Natural England)' }
        ],
        organisations: [{ name: 'Defra' }, { name: 'Natural England' }],
        status: [{ statuses: [FormStatus.Live, FormStatus.Draft] }]
      }

      const result = processFilterResults(filterResults)

      expect(result).toEqual({
        authors: ['Enrique Chase (Defra)', 'Sarah Wilson (Natural England)'],
        organisations: ['Defra', 'Natural England'],
        statuses: ['live', 'draft']
      })
    })

    it('should handle empty filter results', () => {
      /** @type {FilterAggregationResult} */
      const filterResults = {
        authors: [],
        organisations: [],
        status: [{ statuses: [] }]
      }

      const result = processFilterResults(filterResults)

      expect(result).toEqual({
        authors: [],
        organisations: [],
        statuses: []
      })
    })
  })
})

/**
 * @import { AddFieldsSwitch, PipelineStage, FilterAggregationResult } from '~/src/api/forms/repositories/aggregation/types.js'
 */
