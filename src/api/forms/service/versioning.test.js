import { FormStatus } from '@defra/forms-model'

import { buildDefinition } from '~/src/api/forms/__stubs__/definition.js'
import * as formDefinitionRepository from '~/src/api/forms/repositories/form-definition-repository.js'
import * as formMetadataRepository from '~/src/api/forms/repositories/form-metadata-repository.js'
import * as formVersionsRepository from '~/src/api/forms/repositories/form-versions-repository.js'
import { buildFormVersionDocument } from '~/src/api/forms/service/__stubs__/versioning.js'
import {
  createFormVersion,
  createFormVersionAndSession,
  getActiveFormVersions,
  getFormVersion,
  getFormVersionBySemver,
  getFormVersions,
  getLatestFormVersion,
  removeFormVersions,
  updateFormVersionStatus
} from '~/src/api/forms/service/versioning.js'
import { client } from '~/src/mongo.js'

jest.mock('~/src/api/forms/repositories/form-definition-repository.js')
jest.mock('~/src/api/forms/repositories/form-metadata-repository.js')
jest.mock('~/src/api/forms/repositories/form-versions-repository.js')
jest.mock('~/src/mongo.js', () => ({
  client: {
    startSession: jest.fn()
  },
  db: {},
  METADATA_COLLECTION_NAME: 'form-metadata',
  DEFINITION_COLLECTION_NAME: 'form-definition',
  VERSIONS_COLLECTION_NAME: 'form-versions'
}))

describe('versioning service', () => {
  const formId = '661e4ca5039739ef2902b214'
  const mockFormDefinition = buildDefinition({})
  /** @type {any} */
  const mockSession = {
    withTransaction: jest.fn(),
    endSession: jest.fn()
  }
  const now = new Date()

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers().setSystemTime(now)

    mockSession.withTransaction = jest.fn().mockImplementation(async (/** @type {() => Promise<any>} */ callback) => {
      return await callback()
    })
    mockSession.endSession = jest.fn().mockResolvedValue(undefined)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('createFormVersion', () => {
    const mockVersionDocument = buildFormVersionDocument({
      _id: undefined,
      formId,
      versionNumber: '1',
      formDefinition: mockFormDefinition,
      createdAt: now
    })

    beforeEach(() => {
      jest.mocked(formMetadataRepository.getAndIncrementVersionNumber).mockResolvedValue(1)
      jest.mocked(formDefinitionRepository.get).mockResolvedValue(mockFormDefinition)
      jest.mocked(formMetadataRepository.addVersionMetadata).mockResolvedValue(/** @type {any} */ ({}))
      jest.mocked(formVersionsRepository.createVersion).mockResolvedValue(mockVersionDocument)
    })

    it('should create a new version', async () => {
      const result = await createFormVersion(formId, mockSession)

      expect(result).toEqual(mockVersionDocument)
      expect(formMetadataRepository.getAndIncrementVersionNumber).toHaveBeenCalledWith(formId, expect.any(Object))
      expect(formDefinitionRepository.get).toHaveBeenCalledWith(formId, FormStatus.Draft, expect.any(Object))
      expect(formMetadataRepository.addVersionMetadata).toHaveBeenCalledWith(
        formId,
        { versionNumber: 1, createdAt: now },
        expect.any(Object)
      )
      expect(formVersionsRepository.createVersion).toHaveBeenCalledWith(mockVersionDocument, expect.any(Object))
      expect(mockSession.endSession).not.toHaveBeenCalled()
    })

    it('should handle errors', async () => {
      const error = new Error('Database error')
      jest.mocked(formDefinitionRepository.get).mockRejectedValue(error)

      await expect(createFormVersion(formId, mockSession)).rejects.toThrow(error)
      expect(mockSession.endSession).not.toHaveBeenCalled()
    })

    it('should propagate errors thrown by createVersion', async () => {
      const error = new Error('createVersion failed')
      jest.mocked(formVersionsRepository.createVersion).mockRejectedValueOnce(error)

      await expect(createFormVersion(formId, mockSession)).rejects.toThrow(error)
    })

    it('should use atomic increment for version number', async () => {
      jest.mocked(formMetadataRepository.getAndIncrementVersionNumber).mockResolvedValue(4)

      const expectedVersionDocument = {
        ...mockVersionDocument,
        versionNumber: '4'
      }
      jest.mocked(formVersionsRepository.createVersion).mockResolvedValue(expectedVersionDocument)

      const result = await createFormVersion(formId, mockSession)

      expect(result).toEqual(expectedVersionDocument)
      expect(formMetadataRepository.getAndIncrementVersionNumber).toHaveBeenCalledWith(formId, expect.any(Object))
      expect(formMetadataRepository.addVersionMetadata).toHaveBeenCalledWith(
        formId,
        { versionNumber: 4, createdAt: now },
        expect.any(Object)
      )
    })

    it('should create its own session when none provided', async () => {
      // Ensure the mock session is properly set up
      const mockNewSession = /** @type {any} */ ({
        withTransaction: jest.fn().mockImplementation(async (callback) => {
          return await callback()
        }),
        endSession: jest.fn().mockResolvedValue(undefined)
      })
      jest.mocked(client.startSession).mockReturnValue(mockNewSession)

      const result = await createFormVersionAndSession(formId)

      expect(result).toEqual(mockVersionDocument)
      expect(formDefinitionRepository.get).toHaveBeenCalledWith(formId, FormStatus.Draft, expect.any(Object))
      expect(formVersionsRepository.createVersion).toHaveBeenCalledWith(mockVersionDocument, expect.any(Object))
      expect(mockNewSession.withTransaction).toHaveBeenCalled()
      expect(mockNewSession.endSession).toHaveBeenCalled()
    })

    it('should handle errors when creating own session', async () => {
      const error = new Error('Transaction failed')
      jest.mocked(formDefinitionRepository.get).mockRejectedValue(error)

      const mockNewSession = /** @type {any} */ ({
        withTransaction: jest.fn().mockImplementation(async (callback) => {
          return await callback()
        }),
        endSession: jest.fn().mockResolvedValue(undefined)
      })
      jest.mocked(client.startSession).mockReturnValue(mockNewSession)

      await expect(createFormVersionAndSession(formId)).rejects.toThrow(error)
      expect(mockNewSession.withTransaction).toHaveBeenCalled()
      expect(mockNewSession.endSession).toHaveBeenCalled()
    })

    it('should handle errors in transaction and still cleanup session', async () => {
      const error = new Error('Transaction error')

      const mockNewSession = /** @type {any} */ ({
        withTransaction: jest.fn().mockRejectedValue(error),
        endSession: jest.fn().mockResolvedValue(undefined)
      })
      jest.mocked(client.startSession).mockReturnValue(mockNewSession)

      await expect(createFormVersionAndSession(formId)).rejects.toThrow(error)
      expect(mockNewSession.endSession).toHaveBeenCalled()
    })
  })

  describe('getFormVersion', () => {
    const versionNumber = '1'
    const mockVersionDocument = {
      formId,
      versionNumber,
      formDefinition: mockFormDefinition,
      createdAt: now
    }

    it('should retrieve a specific version', async () => {
      jest.mocked(formVersionsRepository.getVersionBySemver).mockResolvedValue(mockVersionDocument)

      const result = await getFormVersion(formId, versionNumber)

      expect(result).toEqual(mockVersionDocument)
      expect(formVersionsRepository.getVersionBySemver).toHaveBeenCalledWith(formId, versionNumber)
    })

    it('should throw Boom.notFound when version not found', async () => {
      jest.mocked(formVersionsRepository.getVersionBySemver).mockResolvedValue(null)

      await expect(getFormVersion(formId, versionNumber)).rejects.toThrow(
        `Version ${versionNumber} for form ID '${formId}' not found`
      )
    })

    it('should handle errors when retrieving a version', async () => {
      const error = new Error('Version not found')
      jest.mocked(formVersionsRepository.getVersionBySemver).mockRejectedValue(error)

      await expect(getFormVersion(formId, versionNumber)).rejects.toThrow(error)
    })
  })

  describe('getFormVersions', () => {
    const mockVersions = [
      {
        formId,
        versionNumber: '1',
        formDefinition: mockFormDefinition,
        createdAt: now
      },
      {
        formId,
        versionNumber: '2',
        formDefinition: mockFormDefinition,
        createdAt: now
      }
    ]

    it('should retrieve all versions for a form', async () => {
      const mockResult = {
        versions: mockVersions,
        totalCount: 2
      }
      jest.mocked(formVersionsRepository.getVersions).mockResolvedValue(mockResult)

      const result = await getFormVersions(formId)

      expect(result).toEqual(mockVersions)
      expect(formVersionsRepository.getVersions).toHaveBeenCalledWith(formId, undefined, 100, 0)
    })

    it('should handle errors when retrieving all versions', async () => {
      const error = new Error('Database error')
      jest.mocked(formVersionsRepository.getVersions).mockRejectedValue(error)

      await expect(getFormVersions(formId)).rejects.toThrow(error)
    })
  })

  describe('getLatestFormVersion', () => {
    const mockLatestVersion = {
      formId,
      versionNumber: '3',
      formDefinition: mockFormDefinition,
      createdAt: now
    }

    it('should retrieve the latest version', async () => {
      jest.mocked(formVersionsRepository.getLatestVersion).mockResolvedValue(mockLatestVersion)

      const result = await getLatestFormVersion(formId)

      expect(result).toEqual(mockLatestVersion)
      expect(formVersionsRepository.getLatestVersion).toHaveBeenCalledWith(formId)
    })

    it('should handle errors when retrieving latest version', async () => {
      const error = new Error('No versions found')
      jest.mocked(formVersionsRepository.getLatestVersion).mockRejectedValue(error)

      await expect(getLatestFormVersion(formId)).rejects.toThrow(error)
    })
  })

  describe('removeFormVersions', () => {
    it('should remove all versions for a form and log success', async () => {
      jest
        .mocked(formVersionsRepository.removeVersionsForForm)
        .mockResolvedValue(/** @type {any} */ ({ deletedCount: 5 }))

      await removeFormVersions(formId, mockSession)

      expect(formVersionsRepository.removeVersionsForForm).toHaveBeenCalledWith(formId, mockSession)
    })

    it('should handle errors when removing versions', async () => {
      const error = new Error('Delete failed')
      jest.mocked(formVersionsRepository.removeVersionsForForm).mockRejectedValue(error)

      await expect(removeFormVersions(formId, mockSession)).rejects.toThrow(error)
    })
  })

  describe('getFormVersionBySemver', () => {
    const semver = '1.0.0'
    const mockVersionDocument = buildFormVersionDocument({ formId, versionNumber: semver })

    it('should return a version document when found', async () => {
      jest.mocked(formVersionsRepository.getVersionBySemver).mockResolvedValue(mockVersionDocument)

      const result = await getFormVersionBySemver(formId, semver)

      expect(result).toEqual(mockVersionDocument)
      expect(formVersionsRepository.getVersionBySemver).toHaveBeenCalledWith(formId, semver)
    })

    it('should return null when the version does not exist', async () => {
      jest.mocked(formVersionsRepository.getVersionBySemver).mockResolvedValue(null)

      const result = await getFormVersionBySemver(formId, semver)

      expect(result).toBeNull()
    })

    it('should propagate errors', async () => {
      const error = new Error('db error')
      jest.mocked(formVersionsRepository.getVersionBySemver).mockRejectedValue(error)

      await expect(getFormVersionBySemver(formId, semver)).rejects.toThrow(error)
    })
  })

  describe('getActiveFormVersions', () => {
    it('should return active version documents', async () => {
      const versions = [
        buildFormVersionDocument({ formId, versionNumber: '1.0.0' }),
        buildFormVersionDocument({ formId, versionNumber: '2.0.0' })
      ]
      jest.mocked(formVersionsRepository.getActiveVersions).mockResolvedValue(versions)

      const result = await getActiveFormVersions(formId)

      expect(result).toEqual(versions)
      expect(formVersionsRepository.getActiveVersions).toHaveBeenCalledWith(formId)
    })

    it('should propagate errors', async () => {
      const error = new Error('db error')
      jest.mocked(formVersionsRepository.getActiveVersions).mockRejectedValue(error)

      await expect(getActiveFormVersions(formId)).rejects.toThrow(error)
    })
  })

  describe('updateFormVersionStatus', () => {
    it('should call repo with correct arguments', async () => {
      jest.mocked(formVersionsRepository.updateVersionStatus).mockResolvedValue(undefined)

      await updateFormVersionStatus(formId, '1.0.0', 'draft')

      expect(formVersionsRepository.updateVersionStatus).toHaveBeenCalledWith(formId, '1.0.0', 'draft')
    })

    it('should propagate errors', async () => {
      const error = new Error('db error')
      jest.mocked(formVersionsRepository.updateVersionStatus).mockRejectedValue(error)

      await expect(updateFormVersionStatus(formId, '1.0.0', 'active')).rejects.toThrow(error)
    })
  })
})

/**
 * @import { ClientSession } from 'mongodb'
 * @import { FormDefinition } from '@defra/forms-model'
 */
