import { defaultConfig } from '~/src/plugins/query-handler/config.js'

/** @satisfies {ServerRegisterPluginObject<void>} */
export const queryHandler = {
  plugin: {
    name: 'queryHandler',
    register(server) {
      server.decorate(
        'toolkit',
        'queryResponse',
        /**
         * @template T
         * @param {Array<T>} data
         * @param {number} totalItems
         * @param {QueryOptions} [options]
         * @param {FilterOptions} [filters]
         * @returns {QueryResult<T>}
         */
        function (data, totalItems, options, filters) {
          const defaults = {
            page: defaultConfig.pagination.page,
            perPage: defaultConfig.pagination.perPage,
            sortBy: defaultConfig.sorting.sortBy,
            order: defaultConfig.sorting.order,
            title: defaultConfig.search.title,
            author: defaultConfig.search.author,
            organisations: defaultConfig.search.organisations,
            status: defaultConfig.search.status
          }

          const { page, perPage, sortBy, order, title, author, organisations, status } = {
            ...defaults,
            ...options
          }

          return {
            data,
            meta: {
              pagination: {
                page,
                perPage,
                totalItems,
                totalPages: Math.ceil(totalItems / perPage)
              },
              sorting: {
                sortBy,
                order
              },
              search: {
                title,
                author,
                organisations,
                status
              },
              filters
            }
          }
        }
      )
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 * @import { QueryOptions, QueryResult, FilterOptions } from '@defra/forms-model'
 */
