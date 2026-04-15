import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { mockClient } from 'aws-sdk-client-mock'
import 'aws-sdk-client-mock-jest'
import { stringify } from 'yaml'

import { config } from '~/src/config/index.js'
import * as formMetadataRepo from '~/src/api/forms/repositories/form-metadata-repository.js'
import * as formVersionsRepo from '~/src/api/forms/repositories/form-versions-repository.js'
import * as configBrokerClient from '~/src/api/forms/service/config-broker-client.js'
import { createFormWithVersion } from '~/src/api/forms/service/index.js'
import { seedFormsFromConfigBroker } from '~/src/api/forms/service/config-broker-seeder.js'
import { ObjectId } from 'mongodb'

jest.mock('~/src/config/index.js', () => ({
  config: { get: jest.fn() }
}))

jest.mock('~/src/helpers/logging/logger.js', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn()
  }))
}))

jest.mock('~/src/api/forms/repositories/form-metadata-repository.js')
jest.mock('~/src/api/forms/repositories/form-versions-repository.js')
jest.mock('~/src/api/forms/service/config-broker-client.js')
jest.mock('~/src/api/forms/service/index.js')

/** @type {Record<string, any>} */
const testConfig = {
  awsRegion: 'eu-west-2',
  s3Endpoint: undefined,
  configBrokerUrl: 'http://broker.test',
  formsApiSlugs: 'example-grant',
  defaultFormOrganisation: 'Defra',
  defaultFormTeamName: 'Digital Delivery',
  defaultFormTeamEmail: 'team@defra.gov.uk',
  defaultFormNotificationEmail: 'notify@defra.gov.uk'
}

/**
 * @param {Record<string, any>} [overrides]
 */
function mockConfigGet(overrides = {}) {
  // @ts-expect-error - test stub
  jest.mocked(config.get).mockImplementation((key) => ({ ...testConfig, ...overrides })[key])
}

const slug = 'example-grant'
const version = '1.0.0'

const mockFormDef = {
  name: 'Example Grant',
  metadata: {
    organisation: 'Defra',
    teamName: 'Digital Delivery',
    teamEmail: 'team@defra.gov.uk',
    notificationEmail: 'notify@defra.gov.uk'
  },
  pages: []
}

const mockYaml = stringify(mockFormDef)

/** @type {import('~/src/api/forms/service/config-broker-client.js').ConfigBrokerGrant[]} */
const mockGrantsResponse = [
  {
    grant: slug,
    versions: [{ version, status: /** @type {'active'} */ ('active'), lastUpdated: '2026-01-01T00:00:00.000Z' }]
  }
]

/** @type {import('~/src/api/forms/service/config-broker-client.js').ConfigBrokerVersionDetail} */
const mockVersionDetail = {
  grant: slug,
  version,
  status: /** @type {'active'} */ ('active'),
  path: 'my-s3-bucket',
  manifest: [`${slug}/${version}/${slug}.yaml`, `${slug}/${version}/metadata.json`],
  lastUpdated: '2026-01-01T00:00:00.000Z'
}

/** @param {string} yaml */
function mockS3Response(yaml) {
  return /** @type {any} */ ({ Body: { transformToString: jest.fn().mockResolvedValue(yaml) } })
}

describe('config-broker-seeder', () => {
  const s3Mock = mockClient(S3Client)

  beforeEach(() => {
    mockConfigGet()
    s3Mock.reset()

    jest.mocked(configBrokerClient.getAllGrants).mockResolvedValue(mockGrantsResponse)
    jest.mocked(configBrokerClient.getGrantVersion).mockResolvedValue(mockVersionDetail)
    jest
      .mocked(formMetadataRepo.getBySlug)
      .mockRejectedValue(new (require('@hapi/boom').Boom)('Not Found', { statusCode: 404 }))
    jest.mocked(formVersionsRepo.getVersionBySemver).mockResolvedValue(null)
    jest
      .mocked(createFormWithVersion)
      .mockResolvedValue(/** @type {any} */ ({ id: 'form-id', slug, title: 'Example Grant' }))

    s3Mock.on(GetObjectCommand).resolves(mockS3Response(mockYaml))
  })

  it('skips seeding when CONFIG_BROKER_URL is not set', async () => {
    mockConfigGet({ configBrokerUrl: '' })
    await seedFormsFromConfigBroker()
    expect(configBrokerClient.getAllGrants).not.toHaveBeenCalled()
  })

  it('skips seeding when FORMS_API_SLUGS is not set', async () => {
    mockConfigGet({ formsApiSlugs: '' })
    await seedFormsFromConfigBroker()
    expect(configBrokerClient.getAllGrants).not.toHaveBeenCalled()
  })

  it('skips seeding when FORMS_API_SLUGS contains only whitespace entries', async () => {
    mockConfigGet({ formsApiSlugs: '  ,  ,  ' })
    await seedFormsFromConfigBroker()
    expect(configBrokerClient.getAllGrants).not.toHaveBeenCalled()
  })

  it('creates a new form+version when the slug does not yet exist in MongoDB', async () => {
    await seedFormsFromConfigBroker()

    expect(configBrokerClient.getGrantVersion).toHaveBeenCalledWith(testConfig.configBrokerUrl, slug, version)
    expect(s3Mock).toHaveReceivedCommandWith(GetObjectCommand, {
      Bucket: mockVersionDetail.path,
      Key: `${slug}/${version}/${slug}.yaml`
    })
    expect(createFormWithVersion).toHaveBeenCalledWith(
      expect.objectContaining({ slug, title: mockFormDef.name }),
      expect.objectContaining({ name: mockFormDef.name }),
      version,
      'active',
      { id: 'system', displayName: 'System Seeder' }
    )
  })

  it('creates a new version when the form exists but the version does not', async () => {
    const existingFormDoc = { _id: new ObjectId('661e4ca5039739ef2902b214'), slug }
    jest.mocked(formMetadataRepo.getBySlug).mockResolvedValue(/** @type {any} */ (existingFormDoc))
    jest.mocked(formVersionsRepo.getVersionBySemver).mockResolvedValue(null)

    await seedFormsFromConfigBroker()

    expect(createFormWithVersion).toHaveBeenCalled()
  })

  it('updates status when version exists with a different status', async () => {
    const formId = '661e4ca5039739ef2902b214'
    const existingFormDoc = { _id: new ObjectId(formId), slug }
    const existingVersion = {
      formId,
      versionNumber: version,
      status: 'draft',
      formDefinition: {},
      createdAt: new Date()
    }

    jest.mocked(formMetadataRepo.getBySlug).mockResolvedValue(/** @type {any} */ (existingFormDoc))
    jest.mocked(formVersionsRepo.getVersionBySemver).mockResolvedValue(/** @type {any} */ (existingVersion))

    await seedFormsFromConfigBroker()

    expect(formVersionsRepo.updateVersionStatus).toHaveBeenCalledWith(formId, version, 'active')
    expect(createFormWithVersion).not.toHaveBeenCalled()
  })

  it('skips when version already exists with the same status', async () => {
    const formId = '661e4ca5039739ef2902b214'
    const existingFormDoc = { _id: new ObjectId(formId), slug }
    const existingVersion = {
      formId,
      versionNumber: version,
      status: 'active',
      formDefinition: {},
      createdAt: new Date()
    }

    jest.mocked(formMetadataRepo.getBySlug).mockResolvedValue(/** @type {any} */ (existingFormDoc))
    jest.mocked(formVersionsRepo.getVersionBySemver).mockResolvedValue(/** @type {any} */ (existingVersion))

    await seedFormsFromConfigBroker()

    expect(formVersionsRepo.updateVersionStatus).not.toHaveBeenCalled()
    expect(createFormWithVersion).not.toHaveBeenCalled()
  })

  it('ignores grants from config broker that are not in FORMS_API_SLUGS', async () => {
    jest
      .mocked(configBrokerClient.getAllGrants)
      .mockResolvedValue([
        ...mockGrantsResponse,
        { grant: 'unrelated-grant', versions: [{ version: '1.0.0', status: 'active', lastUpdated: '' }] }
      ])

    await seedFormsFromConfigBroker()

    expect(configBrokerClient.getGrantVersion).toHaveBeenCalledTimes(1)
    expect(configBrokerClient.getGrantVersion).toHaveBeenCalledWith(testConfig.configBrokerUrl, slug, version)
  })

  it('continues seeding remaining versions when one version fails', async () => {
    const grantWithTwoVersions = [
      {
        grant: slug,
        versions: [
          { version: '1.0.0', status: 'active', lastUpdated: '' },
          { version: '2.0.0', status: 'active', lastUpdated: '' }
        ]
      }
    ]
    jest.mocked(configBrokerClient.getAllGrants).mockResolvedValue(/** @type {any} */ (grantWithTwoVersions))
    jest
      .mocked(configBrokerClient.getGrantVersion)
      .mockResolvedValueOnce(mockVersionDetail)
      .mockRejectedValueOnce(new Error('broker error'))

    await expect(seedFormsFromConfigBroker()).resolves.not.toThrow()
    expect(configBrokerClient.getGrantVersion).toHaveBeenCalledTimes(2)
  })

  it('aborts gracefully when getAllGrants fails', async () => {
    jest.mocked(configBrokerClient.getAllGrants).mockRejectedValue(new Error('network error'))

    await expect(seedFormsFromConfigBroker()).resolves.not.toThrow()
    expect(createFormWithVersion).not.toHaveBeenCalled()
  })

  it('throws when the manifest has no yaml file', async () => {
    jest.mocked(configBrokerClient.getGrantVersion).mockResolvedValue({
      ...mockVersionDetail,
      manifest: [`${slug}/${version}/metadata.json`]
    })

    await expect(seedFormsFromConfigBroker()).resolves.not.toThrow()
    expect(createFormWithVersion).not.toHaveBeenCalled()
  })

  it('continues when S3 returns an empty response body', async () => {
    s3Mock.on(GetObjectCommand).resolves({})

    await expect(seedFormsFromConfigBroker()).resolves.not.toThrow()
    expect(createFormWithVersion).not.toHaveBeenCalled()
  })

  it('continues when S3 YAML parses to a non-object value', async () => {
    s3Mock.on(GetObjectCommand).resolves(mockS3Response('null'))

    await expect(seedFormsFromConfigBroker()).resolves.not.toThrow()
    expect(createFormWithVersion).not.toHaveBeenCalled()
  })

  it('uses s3Endpoint and forcePathStyle when s3Endpoint is configured', async () => {
    mockConfigGet({ s3Endpoint: 'http://localhost:4566' })

    await seedFormsFromConfigBroker()

    expect(createFormWithVersion).toHaveBeenCalled()
  })

  it('falls back to config defaults when form YAML has no metadata fields', async () => {
    const defWithNoMeta = { name: 'Minimal Form', pages: [] }
    s3Mock.on(GetObjectCommand).resolves(mockS3Response(stringify(defWithNoMeta)))

    await seedFormsFromConfigBroker()

    expect(createFormWithVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        organisation: testConfig.defaultFormOrganisation,
        teamName: testConfig.defaultFormTeamName,
        teamEmail: testConfig.defaultFormTeamEmail,
        notificationEmail: testConfig.defaultFormNotificationEmail
      }),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything()
    )
  })
})
