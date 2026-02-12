import { FormStatus } from '@defra/forms-model'

import { escapeRegExp } from '~/src/helpers/string-utils.js'

/**
 * Builds the filter conditions for querying forms.
 * @param {FilterQuery} options - The filter query options
 * @returns {FilterConditions} The filter conditions for MongoDB query.
 */
export function buildFilterConditions(options) {
  const { title, author, organisations, status } = options
  const conditions = {}

  if (title) {
    const regex = new RegExp(escapeRegExp(title), 'i')
    conditions.title = { $regex: regex }
  }

  if (author) {
    const regex = new RegExp(escapeRegExp(author), 'i')
    conditions['createdBy.displayName'] = { $regex: regex }
  }

  if (organisations && organisations.length > 0) {
    conditions.organisation = { $in: organisations }
  }

  if (status && status.length > 0) {
    conditions.$or = status.map((s) =>
      s === FormStatus.Live ? { live: { $exists: true } } : { live: { $exists: false } }
    )
  }

  return conditions
}

/**
 * Builds the filters facet pipeline stage
 * @see {@link https://www.mongodb.com/docs/manual/reference/operator/aggregation/facet/}
 * @returns {{ $facet: { authors: PipelineStage[], organisations: PipelineStage[], status: PipelineStage[] } }} The facet pipeline stage for getting filter options
 */
export function buildFiltersFacet() {
  return {
    $facet: {
      authors: [
        {
          $group: {
            _id: '$createdBy.displayName' // Groups documents by author name, removing duplicates
          }
        },
        {
          $project: {
            _id: 0,
            name: '$_id' // Renames _id to name for cleaner output
          }
        },
        { $sort: { name: 1 } } // Sorts alphabetically (1 = ascending)
      ],
      organisations: [
        { $group: { _id: '$organisation' } },
        { $project: { name: '$_id', _id: 0 } },
        { $sort: { name: 1 } }
      ],
      status: [
        {
          $group: {
            _id: null, // Single group for all documents
            statuses: {
              $addToSet: {
                $cond: [{ $ifNull: ['$live', false] }, 'live', 'draft'] // If live field exists, status is 'live', else 'draft'
              }
            }
          }
        },
        { $project: { statuses: 1, _id: 0 } }
      ]
    }
  }
}

/**
 * Builds the aggregation pipeline and aggregation options for the query.
 * @param {string} sortBy - Field to sort by ('updatedAt' or 'title').
 * @param {string} order - Sort order ('asc' or 'desc').
 * @param {string} title - The title to filter by.
 * @param {string} author - The author to filter by.
 * @param {string[]} organisations - The organisations to filter by.
 * @param {FormStatus[]} status - The status values to filter by.
 * @returns {{ pipeline: PipelineStage[], aggOptions: AggregateOptions }}
 */
export function buildAggregationPipeline(sortBy, order, title, author, organisations, status) {
  const pipeline = []
  const filterConditions = buildFilterConditions({
    title,
    author,
    organisations,
    status
  })

  // Add $match stage if there are filter conditions
  if (Object.keys(filterConditions).length > 0) {
    pipeline.push({ $match: filterConditions })
  }

  addRankingStage(pipeline, title)

  addDateFieldStage(pipeline)

  const collation = addSortingStage(pipeline, sortBy, order)

  const aggOptions = { collation }

  return { pipeline, aggOptions }
}

/**
 * Builds the aggregation pipeline with versions lookup.
 * @param {string} sortBy - Field to sort by ('updatedAt' or 'title').
 * @param {string} order - Sort order ('asc' or 'desc').
 * @param {string} title - The title to filter by.
 * @param {string} author - The author to filter by.
 * @param {string[]} organisations - The organisations to filter by.
 * @param {FormStatus[]} status - The status values to filter by.
 * @returns {{ pipeline: PipelineStage[], aggOptions: AggregateOptions }}
 */
export function buildAggregationPipelineWithVersions(sortBy, order, title, author, organisations, status) {
  const { pipeline, aggOptions } = buildAggregationPipeline(sortBy, order, title, author, organisations, status)

  addVersionsLookupStage(pipeline)

  return { pipeline, aggOptions }
}

/**
 * Adds the ranking stage to the pipeline based on the title.
 * @see {@link https://www.mongodb.com/docs/manual/reference/operator/aggregation/rank/}
 * @param {PipelineStage[]} pipeline - The aggregation pipeline stages.
 * @param {string} title - The title to filter by.
 */
export function addRankingStage(pipeline, title) {
  if (title) {
    const searchTerm = title

    // Add 'matchScore' field to rank the documents
    pipeline.push({
      $addFields: {
        matchScore: /** @type {AddFieldsSwitch} */ ({
          $switch: {
            branches: [
              // Rank 1: Exact whole title match (case-insensitive)
              {
                case: {
                  $eq: [{ $toLower: '$title' }, searchTerm.toLowerCase()]
                },
                then: 1
              },
              // Rank 2: Whole word match in the title (case-insensitive)
              {
                case: {
                  $regexMatch: {
                    input: '$title',
                    regex: `\\b${escapeRegExp(searchTerm)}\\b`,
                    options: 'i'
                  }
                },
                then: 2
              },
              // Rank 3: Partial substring match in the title (case-insensitive)
              {
                case: {
                  $regexMatch: {
                    input: '$title',
                    regex: escapeRegExp(searchTerm),
                    options: 'i'
                  }
                },
                then: 3
              }
            ],
            default: 4
          }
        })
      }
    })
  } else {
    pipeline.push({
      $addFields: {
        matchScore: 0
      }
    })
  }
}

/**
 * Adds the date field stage to the pipeline to extract date only from 'updatedAt'.
 * @see {@link https://www.mongodb.com/docs/manual/reference/operator/aggregation/dateToString/}
 * @param {PipelineStage[]} pipeline - The aggregation pipeline stages.
 */
export function addDateFieldStage(pipeline) {
  const dateFieldStage = {
    $addFields: {
      updatedDateOnly: {
        $dateToString: {
          format: '%Y-%m-%d',
          date: '$updatedAt',
          timezone: 'UTC'
        }
      }
    }
  }
  pipeline.push(dateFieldStage)
}

/**
 * Adds the sorting stage to the pipeline based on the sortBy parameter.
 * @see {@link https://www.mongodb.com/docs/manual/reference/operator/aggregation/sort/}
 * @param {PipelineStage[]} pipeline - The aggregation pipeline stages.
 * @param {string} sortBy - Field to sort by ('updatedAt' or 'title').
 * @param {string} order - Sort order ('asc' or 'desc').
 * @returns {CollationOptions} The collation options.
 */
export function addSortingStage(pipeline, sortBy, order) {
  const sortOrder = order === 'asc' ? 1 : -1
  const collation = { locale: 'en', strength: 1 }

  switch (sortBy) {
    case 'title':
      pipeline.push({
        $sort: {
          // Primary sort is title
          title: sortOrder,
          // Then newest first if titles tie
          updatedDateOnly: -1,
          // Then alphabetical (case-insensitive) on displayName
          'updatedBy.displayName': 1
        }
      })
      break

    case 'updatedAt':
      pipeline.push({
        $sort: {
          updatedDateOnly: sortOrder,
          'updatedBy.displayName': 1
        }
      })
      break

    default:
      pipeline.push({
        $sort: {
          updatedDateOnly: -1,
          'updatedBy.displayName': 1
        }
      })
      break
  }

  return collation
}

/**
 * Adds the versions lookup stage to join with form-versions collection
 * @param {PipelineStage[]} pipeline - The aggregation pipeline stages.
 */
export function addVersionsLookupStage(pipeline) {
  pipeline.push({
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
}

/**
 * Processes author names from aggregation results, filtering out invalid values
 * @param {{name: string}[]} authors - Array of author objects from aggregation
 * @returns {string[]} Filtered array of valid author names
 *
 * This is a temp workaround for the fact that the author name (given_name and family_name)
 * is sometimes undefined due to not being register with a Defra account, although we've
 * changed that now to default to their display name when creating or updating a form
 */
export function processAuthorNames(authors) {
  return authors.map((author) => author.name).filter((name) => name && name !== 'undefined undefined')
}

/**
 * Processes filter results from aggregation into a structured FilterOptions object
 * @param {FilterAggregationResult} filterResults - Raw filter results from aggregation
 */
export function processFilterResults(filterResults) {
  return {
    authors: processAuthorNames(filterResults.authors),
    organisations: filterResults.organisations.map((org) => org.name),
    statuses: filterResults.status.at(0)?.statuses ?? []
  }
}

/**
 * @import { AddFieldsSwitch, FilterConditions, FilterQuery, PipelineStage, FilterAggregationResult } from '~/src/api/forms/repositories/aggregation/types.js'
 */

/**
 * @import { FilterOptions } from '@defra/forms-model'
 */

/**
 * @import { AggregateOptions, CollationOptions } from 'mongodb'
 */
