import { FormStatus } from '@defra/forms-model'
import { ObjectId } from 'mongodb'

import author from '~/src/api/forms/service/__stubs__/author.js'

const id = '661e4ca5039739ef2902b214'
const slug = 'test-form'
export const DRAFT = 'draft'
export const BASE_CREATED_DATE = new Date('2020-01-01')
/**
 * @type {FormMetadataInputWithSlug}
 */
export const formMetadataInput = {
  title: 'Test form',
  organisation: 'Defra',
  teamName: 'Defra Forms',
  teamEmail: 'defraforms@defra.gov.uk',
  slug: 'test-form',
  contact: {
    phone: '0800 000 1234'
  },
  submissionGuidance: 'We’ll send you an email to let you know the outcome.',
  privacyNoticeUrl: 'https://www.gov.uk/help/privacy-notice',
  notificationEmail: 'defraforms@defra.gov.uk'
}

/**
 * @satisfies {FormMetadata}
 */
export const formMetadataOutput = {
  ...formMetadataInput,
  id,
  slug,
  draft: {
    createdAt: BASE_CREATED_DATE,
    createdBy: author,
    updatedAt: BASE_CREATED_DATE,
    updatedBy: author
  },
  live: undefined,
  createdAt: BASE_CREATED_DATE,
  createdBy: author,
  updatedAt: BASE_CREATED_DATE,
  updatedBy: author,
  versions: []
}

/**
 * @satisfies {FormMetadata}
 */
export const formMetadataWithLiveOutput = {
  ...formMetadataInput,
  id,
  slug,
  draft: {
    createdAt: BASE_CREATED_DATE,
    createdBy: author,
    updatedAt: BASE_CREATED_DATE,
    updatedBy: author
  },
  live: {
    createdAt: BASE_CREATED_DATE,
    createdBy: author,
    updatedAt: BASE_CREATED_DATE,
    updatedBy: author
  },
  createdAt: BASE_CREATED_DATE,
  createdBy: author,
  updatedAt: BASE_CREATED_DATE,
  updatedBy: author
}

/**
 * @satisfies {WithId<FormMetadataDocument>}
 */
export const formMetadataDocument = {
  ...formMetadataInput,
  _id: new ObjectId(id),
  slug: formMetadataOutput.slug,
  draft: formMetadataOutput.draft,
  createdAt: BASE_CREATED_DATE,
  createdBy: author,
  updatedAt: BASE_CREATED_DATE,
  updatedBy: author,
  versions: []
}

/**
 * @satisfies {WithId<FormMetadataDocument>}
 */
export const formMetadataWithLiveDocument = {
  ...formMetadataInput,
  _id: new ObjectId(id),
  slug: formMetadataWithLiveOutput.slug,
  draft: formMetadataWithLiveOutput.draft,
  live: formMetadataWithLiveOutput.live,
  createdAt: BASE_CREATED_DATE,
  createdBy: author,
  updatedAt: BASE_CREATED_DATE,
  updatedBy: author
}

/**
 * @satisfies {FilterOptions}
 */
export const mockFilters = {
  authors: ['Joe Bloggs', 'Jane Doe', 'Enrique Chase'],
  organisations: ['Defra', 'Natural England'],
  status: [FormStatus.Live, FormStatus.Draft]
}

/**
 * @import { FormMetadataDocument, FormMetadataInput, FormMetadata, FilterOptions } from '@defra/forms-model'
 * @import { WithId } from 'mongodb'
 * @import { FormMetadataInputWithSlug } from '~/src/api/types.js'
 */
