import {
  FormStatus,
  Scopes,
  formMetadataInputKeys,
  formMetadataInputSchema,
  queryOptionsSchema
} from '@defra/forms-model'
import Boom from '@hapi/boom'

import {
  createDraftFromLive,
  createLiveFromDraft,
  deleteDraftFormDefinition,
  getFormDefinition,
  listForms,
  updateDraftFormDefinition
} from '~/src/api/forms/service/definition.js'
import { createForm, getForm, getFormBySlug, removeForm, updateFormMetadata } from '~/src/api/forms/service/index.js'
import { migrateDefinitionToV2 } from '~/src/api/forms/service/migration.js'
import { getFormVersion, getFormVersions } from '~/src/api/forms/service/versioning.js'
import { getAuthor } from '~/src/helpers/get-author.js'
import { formVersionByIdSchema } from '~/src/models/form-versions.js'
import {
  createFormSchema,
  formByIdSchema,
  formBySlugSchema,
  migrateDefinitionParamSchema,
  updateFormDefinitionSchema
} from '~/src/models/forms.js'

export const ROUTE_FORMS = '/forms/{id}'

/**
 * @type {ServerRoute[]}
 */
export default [
  {
    method: 'GET',
    path: '/forms',
    /**
     * @param {RequestListForms} request
     * @param {ExtendedResponseToolkit<FormMetadata>} h
     */
    async handler(request, h) {
      const { query } = request

      const { forms, totalItems, filters } = await listForms(query)

      return h.queryResponse(forms, totalItems, query, filters)
    },
    options: {
      auth: false,
      validate: {
        query: queryOptionsSchema
      }
    }
  },
  {
    method: 'POST',
    path: '/forms',
    /**
     * @param {RequestFormMetadataCreate} request
     */
    async handler(request) {
      const { auth, payload } = request
      const author = getAuthor(auth.credentials.user)

      const formMetadata = await createForm(payload, author)

      return {
        id: formMetadata.id,
        slug: formMetadata.slug,
        status: 'created'
      }
    },
    options: {
      auth: {
        scope: [`+${Scopes.FormEdit}`]
      },
      validate: {
        payload: createFormSchema
      }
    }
  },
  {
    method: 'PATCH',
    path: ROUTE_FORMS,
    /**
     * @param {RequestFormMetadataUpdateById} request
     */
    async handler(request) {
      const { auth, params, payload } = request
      const author = getAuthor(auth.credentials.user)
      const { id } = params

      const form = await getForm(id)
      if (form.live) {
        const userScopes = auth.credentials.scope ?? []
        if (!userScopes.includes(Scopes.FormPublish)) {
          throw Boom.forbidden('Form is live - FormPublish scope required to update metadata')
        }
      }

      const slug = await updateFormMetadata(id, payload, author)

      return {
        id,
        slug,
        status: 'updated'
      }
    },
    options: {
      auth: {
        scope: [`+${Scopes.FormEdit}`]
      },
      validate: {
        params: formByIdSchema,
        // Take the form metadata update schema and make all fields optional. This acts similar to Partial<T> in Typescript.
        payload: formMetadataInputSchema.fork(Object.keys(formMetadataInputKeys), (schema) => schema.optional())
      }
    }
  },
  {
    method: 'GET',
    path: ROUTE_FORMS,
    /**
     * @param {RequestFormById} request
     */
    handler(request) {
      const { params } = request
      const { id } = params

      return getForm(id)
    },
    options: {
      auth: false,
      validate: {
        params: formByIdSchema
      }
    }
  },
  {
    method: 'GET',
    path: '/forms/slug/{slug}',
    /**
     * @param {RequestFormBySlug} request
     */
    handler(request) {
      const { params } = request
      const { slug } = params

      return getFormBySlug(slug)
    },
    options: {
      auth: false,
      validate: {
        params: formBySlugSchema
      }
    }
  },
  {
    method: 'DELETE',
    path: ROUTE_FORMS,
    /**
     * @param {RequestFormById} request
     */
    async handler(request) {
      const { auth } = request
      const { id } = request.params
      const author = getAuthor(auth.credentials.user)
      await removeForm(id, author)

      return {
        id,
        status: 'deleted'
      }
    },
    options: {
      auth: {
        scope: [`+${Scopes.FormDelete}`]
      },
      validate: {
        params: formByIdSchema
      }
    }
  },
  {
    method: 'DELETE',
    path: '/forms/{id}/draft',
    /**
     * Delete the draft definition only of a form, leaving the live definition (including relevant metadata)
     * @param {RequestFormById} request
     */
    async handler(request) {
      const { auth } = request
      const { id } = request.params
      const author = getAuthor(auth.credentials.user)
      await deleteDraftFormDefinition(id, author)

      return {
        id,
        status: 'deleted'
      }
    },
    options: {
      auth: {
        scope: [`+${Scopes.FormDelete}`]
      },
      validate: {
        params: formByIdSchema
      }
    }
  },
  {
    method: 'GET',
    path: '/forms/{id}/definition/draft',
    /**
     * @param {RequestFormById} request
     */
    handler(request) {
      const { params } = request
      const { id } = params

      return getFormDefinition(id)
    },
    options: {
      auth: false,
      validate: {
        params: formByIdSchema
      }
    }
  },
  {
    method: 'POST',
    path: '/forms/{id}/definition/draft',
    /**
     * @param {RequestFormDefinition} request
     */
    async handler(request) {
      const { auth, params, payload } = request
      const author = getAuthor(auth.credentials.user)

      await updateDraftFormDefinition(params.id, payload, author)

      return {
        id: params.id,
        status: 'updated'
      }
    },
    options: {
      auth: {
        scope: [`+${Scopes.FormEdit}`]
      },
      validate: {
        payload: updateFormDefinitionSchema
      }
    }
  },
  {
    method: 'POST',
    path: '/forms/{id}/definition/draft/migrate/{version}',
    /**
     * @param {MigrateDraftFormRequest} request
     */
    handler(request) {
      const { auth, params } = request
      const author = getAuthor(auth.credentials.user)

      return migrateDefinitionToV2(params.id, author)
    },
    options: {
      auth: {
        scope: [`+${Scopes.FormEdit}`]
      },
      validate: {
        params: migrateDefinitionParamSchema
      }
    }
  },
  {
    method: 'GET',
    path: '/forms/{id}/definition',
    /**
     * @param {RequestFormById} request
     */
    handler(request) {
      const { params } = request
      const { id } = params

      return getFormDefinition(id, FormStatus.Live)
    },
    options: {
      auth: false,
      validate: {
        params: formByIdSchema
      }
    }
  },
  {
    method: 'POST',
    path: '/forms/{id}/create-live',
    /**
     * @param {RequestFormById} request
     */
    async handler(request) {
      const { auth, params } = request
      const { id } = params
      const author = getAuthor(auth.credentials.user)

      // Create the live state from draft using the author in the credentials
      await createLiveFromDraft(id, author)

      return {
        id,
        status: 'created-live'
      }
    },
    options: {
      auth: {
        scope: [`+${Scopes.FormPublish}`]
      },
      validate: {
        params: formByIdSchema
      }
    }
  },
  {
    method: 'POST',
    path: '/forms/{id}/create-draft',
    /**
     * @param {RequestFormById} request
     */
    async handler(request) {
      const { auth, params } = request
      const { id } = params
      const author = getAuthor(auth.credentials.user)

      // Recreate the draft state from live using the author in the credentials
      await createDraftFromLive(id, author)

      return {
        id,
        status: 'created-draft'
      }
    },
    options: {
      auth: {
        scope: [`+${Scopes.FormEdit}`]
      },
      validate: {
        params: formByIdSchema
      }
    }
  },
  {
    method: 'GET',
    path: '/forms/{id}/versions',
    /**
     * @param {RequestFormById} request
     */
    async handler(request) {
      const { params } = request
      const { id } = params

      const versions = await getFormVersions(id)
      return {
        versions: versions.map((v) => ({
          versionNumber: v.versionNumber,
          createdAt: v.createdAt
        }))
      }
    },
    options: {
      auth: false,
      validate: {
        params: formByIdSchema
      }
    }
  },
  {
    method: 'GET',
    path: '/forms/{id}/versions/{versionNumber}',
    /**
     * @param {RequestFormVersionById} request
     */
    async handler(request) {
      const { params } = request
      const { id, versionNumber } = params

      const version = await getFormVersion(id, parseInt(versionNumber))
      return {
        versionNumber: version.versionNumber,
        createdAt: version.createdAt
      }
    },
    options: {
      auth: false,
      validate: {
        params: formVersionByIdSchema
      }
    }
  },
  {
    method: 'GET',
    path: '/forms/{id}/versions/{versionNumber}/definition',
    /**
     * @param {RequestFormVersionById} request
     */
    async handler(request) {
      const { params } = request
      const { id, versionNumber } = params

      const version = await getFormVersion(id, parseInt(versionNumber))
      return version.formDefinition
    },
    options: {
      auth: false,
      validate: {
        params: formVersionByIdSchema
      }
    }
  }
]

/**
 * @import { FormMetadata } from '@defra/forms-model'
 * @import { ServerRoute } from '@hapi/hapi'
 * @import { RequestFormById, RequestFormBySlug, RequestFormDefinition, RequestFormMetadataCreate, RequestFormMetadataUpdateById, RequestListForms, MigrateDraftFormRequest, RequestFormVersionById } from '~/src/api/types.js'
 * @import { ExtendedResponseToolkit } from '~/src/plugins/query-handler/types.js'
 */
