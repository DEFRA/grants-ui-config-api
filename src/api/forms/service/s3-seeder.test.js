import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import Boom from '@hapi/boom'
import { mockClient } from 'aws-sdk-client-mock'
import 'aws-sdk-client-mock-jest'
import { stringify } from 'yaml'

import { config } from '~/src/config/index.js'
import * as formMetadataRepo from '~/src/api/forms/repositories/form-metadata-repository.js'
import { createLiveFromDraft, updateDraftFormDefinition } from '~/src/api/forms/service/definition.js'
import { createForm } from '~/src/api/forms/service/index.js'
import { formMetadataDocument, formMetadataOutput } from '~/src/api/forms/service/__stubs__/service.js'
import { seedFormsFromS3 } from '~/src/api/forms/service/s3-seeder.js'

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
jest.mock('~/src/api/forms/service/index.js')
jest.mock('~/src/api/forms/service/definition.js')

/** @type {Record<string, any>} */
const testConfig = {
  awsRegion: 'eu-west-2',
  s3Endpoint: undefined,
  formsConfigBucket: 'test-bucket',
  formsApiSlugs: 'test-form',
  defaultFormOrganisation: 'Default Org',
  defaultFormTeamName: 'Default Team',
  defaultFormTeamEmail: 'default@example.com',
  defaultFormNotificationEmail: 'notify@example.com'
}

/**
 * Sets up config.get mock with optional overrides for individual keys
 * @param {Record<string, any>} [overrides]
 */
function mockConfigGet(overrides = {}) {
  // @ts-expect-error - test stub, key is not typed as Path<ConfigType>
  jest.mocked(config.get).mockImplementation((key) => ({ ...testConfig, ...overrides })[key])
}

const mockSlug = 'test-form'

const mockFormDef = {
  name: 'Test Form',
  metadata: {
    organisation: 'Test Org',
    teamName: 'Test Team',
    teamEmail: 'team@test.com',
    notificationEmail: 'notify@test.com'
  },
  pages: []
}

const mockYaml = stringify(mockFormDef)

/**
 * Builds a mock S3 GetObject response with a YAML body
 * @param {string} yaml
 * @returns {any}
 */
function mockS3Response(yaml) {
  return { Body: { transformToString: jest.fn().mockResolvedValue(yaml) } }
}

describe('s3-seeder', () => {
  const s3Mock = mockClient(S3Client)

  beforeEach(() => {
    mockConfigGet()

    jest.mocked(formMetadataRepo.getBySlug).mockRejectedValue(Boom.notFound())
    jest.mocked(createForm).mockResolvedValue(formMetadataOutput)
    jest.mocked(updateDraftFormDefinition).mockResolvedValue(undefined)
    jest.mocked(createLiveFromDraft).mockResolvedValue(undefined)

    s3Mock.on(ListObjectsV2Command).resolves({
      CommonPrefixes: [{ Prefix: `${mockSlug}/0.0.1/` }, { Prefix: `${mockSlug}/0.1.0/` }]
    })
    s3Mock.on(GetObjectCommand).resolves(mockS3Response(mockYaml))
  })

  afterEach(() => {
    s3Mock.reset()
  })

  describe('seedFormsFromS3', () => {
    describe('early exit conditions', () => {
      it('skips seeding when formsApiSlugs is not configured', async () => {
        mockConfigGet({ formsApiSlugs: undefined })

        await seedFormsFromS3()

        expect(createForm).not.toHaveBeenCalled()
        expect(s3Mock).not.toHaveReceivedCommand(ListObjectsV2Command)
      })

      it('skips seeding when formsConfigBucket is not configured', async () => {
        mockConfigGet({ formsConfigBucket: undefined })

        await seedFormsFromS3()

        expect(createForm).not.toHaveBeenCalled()
        expect(s3Mock).not.toHaveReceivedCommand(ListObjectsV2Command)
      })

      it('skips seeding when formsApiSlugs is empty after trimming and splitting', async () => {
        mockConfigGet({ formsApiSlugs: '  ,  ,  ' })

        await seedFormsFromS3()

        expect(createForm).not.toHaveBeenCalled()
        expect(s3Mock).not.toHaveReceivedCommand(ListObjectsV2Command)
      })
    })

    describe('version resolution', () => {
      it('picks the latest semver version when multiple versions exist in S3', async () => {
        s3Mock.on(ListObjectsV2Command).resolves({
          CommonPrefixes: [
            { Prefix: `${mockSlug}/0.1.0/` },
            { Prefix: `${mockSlug}/0.0.5/` },
            { Prefix: `${mockSlug}/0.0.1/` }
          ]
        })

        await seedFormsFromS3()

        expect(s3Mock).toHaveReceivedCommandWith(GetObjectCommand, {
          Bucket: 'test-bucket',
          Key: `${mockSlug}/0.1.0/grants-ui/${mockSlug}.yaml`
        })
      })

      it('sends ListObjectsV2 with the correct bucket, prefix, and delimiter', async () => {
        await seedFormsFromS3()

        expect(s3Mock).toHaveReceivedCommandWith(ListObjectsV2Command, {
          Bucket: 'test-bucket',
          Prefix: `${mockSlug}/`,
          Delimiter: '/'
        })
      })

      it('logs an error and continues when no versions are found for a slug', async () => {
        s3Mock.on(ListObjectsV2Command).resolves({ CommonPrefixes: [] })

        await seedFormsFromS3()

        expect(createForm).not.toHaveBeenCalled()
        expect(s3Mock).not.toHaveReceivedCommand(GetObjectCommand)
      })
    })

    describe('form seeding', () => {
      it('skips a slug that already exists in MongoDB', async () => {
        jest.mocked(formMetadataRepo.getBySlug).mockResolvedValue(formMetadataDocument)

        await seedFormsFromS3()

        expect(createForm).not.toHaveBeenCalled()
        expect(updateDraftFormDefinition).not.toHaveBeenCalled()
        expect(createLiveFromDraft).not.toHaveBeenCalled()
      })

      it('calls createForm, updateDraftFormDefinition, and createLiveFromDraft for a new slug', async () => {
        await seedFormsFromS3()

        expect(createForm).toHaveBeenCalledTimes(1)
        expect(updateDraftFormDefinition).toHaveBeenCalledTimes(1)
        expect(createLiveFromDraft).toHaveBeenCalledTimes(1)
      })

      it('passes the form definition and system author to updateDraftFormDefinition', async () => {
        await seedFormsFromS3()

        expect(updateDraftFormDefinition).toHaveBeenCalledWith(
          formMetadataOutput.id,
          expect.objectContaining({ name: 'Test Form' }),
          expect.objectContaining({ id: 'system', displayName: 'System Seeder' })
        )
      })

      it('publishes the draft using the form id and system author', async () => {
        await seedFormsFromS3()

        expect(createLiveFromDraft).toHaveBeenCalledWith(
          formMetadataOutput.id,
          expect.objectContaining({ id: 'system', displayName: 'System Seeder' })
        )
      })

      it('passes metadata extracted from the form definition to createForm', async () => {
        await seedFormsFromS3()

        expect(createForm).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Test Form',
            slug: mockSlug,
            organisation: 'Test Org',
            teamName: 'Test Team',
            teamEmail: 'team@test.com',
            notificationEmail: 'notify@test.com'
          }),
          expect.objectContaining({ id: 'system' })
        )
      })

      it('falls back to config defaults when the form definition has no metadata', async () => {
        const defWithoutMeta = { name: 'Minimal Form', pages: [] }

        s3Mock.on(GetObjectCommand).resolves(mockS3Response(stringify(defWithoutMeta)))

        await seedFormsFromS3()

        expect(createForm).toHaveBeenCalledWith(
          expect.objectContaining({
            organisation: 'Default Org',
            teamName: 'Default Team',
            teamEmail: 'default@example.com',
            notificationEmail: 'notify@example.com'
          }),
          expect.anything()
        )
      })

      it('seeds multiple slugs from a comma-separated config value', async () => {
        const secondSlug = 'another-form'

        mockConfigGet({ formsApiSlugs: `${mockSlug},${secondSlug}` })

        s3Mock
          .on(ListObjectsV2Command, { Prefix: `${secondSlug}/` })
          .resolves({ CommonPrefixes: [{ Prefix: `${secondSlug}/1.0.0/` }] })

        s3Mock.on(GetObjectCommand).resolves(mockS3Response(mockYaml))

        await seedFormsFromS3()

        expect(createForm).toHaveBeenCalledTimes(2)
      })
    })

    describe('error handling', () => {
      it('logs an error and continues seeding remaining slugs when one slug fails', async () => {
        const failingSlug = 'failing-form'

        mockConfigGet({ formsApiSlugs: `${failingSlug},${mockSlug}` })

        s3Mock.on(ListObjectsV2Command, { Prefix: `${failingSlug}/` }).resolves({ CommonPrefixes: [] })

        s3Mock
          .on(ListObjectsV2Command, { Prefix: `${mockSlug}/` })
          .resolves({ CommonPrefixes: [{ Prefix: `${mockSlug}/0.0.1/` }] })

        await seedFormsFromS3()

        expect(createForm).toHaveBeenCalledTimes(1)
        expect(createForm).toHaveBeenCalledWith(expect.objectContaining({ slug: mockSlug }), expect.anything())
      })

      it('does not seed when getBySlug throws a non-404 Boom error', async () => {
        jest.mocked(formMetadataRepo.getBySlug).mockRejectedValue(Boom.badRequest('Unexpected error'))

        await seedFormsFromS3()

        expect(createForm).not.toHaveBeenCalled()
      })

      it('does not seed when getBySlug throws a generic error', async () => {
        jest.mocked(formMetadataRepo.getBySlug).mockRejectedValue(new Error('DB connection failed'))

        await seedFormsFromS3()

        expect(createForm).not.toHaveBeenCalled()
      })

      it('logs and continues when the S3 response body is empty', async () => {
        s3Mock.on(GetObjectCommand).resolves(/** @type {any} */ ({ Body: null }))

        await seedFormsFromS3()

        expect(createForm).not.toHaveBeenCalled()
      })

      it('logs and continues when the S3 body is not a valid YAML object', async () => {
        s3Mock.on(GetObjectCommand).resolves(mockS3Response('just a plain string'))

        await seedFormsFromS3()

        expect(createForm).not.toHaveBeenCalled()
      })
    })
  })
})
