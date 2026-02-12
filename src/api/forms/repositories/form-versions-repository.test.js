import { buildDefinition } from '@defra/forms-model/stubs'
import Boom from '@hapi/boom'
import { ObjectId } from 'mongodb'

import { buildMockCollection } from '~/src/api/forms/__stubs__/mongo.js'
import {
  MAX_VERSIONS,
  createVersion,
  getLatestVersion,
  getLatestVersionNumber,
  getVersion,
  getVersionSummaries,
  getVersionSummariesBatch,
  getVersions,
  removeVersionsForForm
} from '~/src/api/forms/repositories/form-versions-repository.js'
import { db } from '~/src/mongo.js'

const mockCollection = buildMockCollection()

jest.mock('~/src/mongo.js', () => ({
  db: {
    collection: jest.fn()
  },
  VERSIONS_COLLECTION_NAME: 'form-versions'
}))

describe('form-versions-repository', () => {
  const formId = '661e4ca5039739ef2902b214'
  /** @type {any} */
  const mockSession = {}
  const now = new Date()
  const mockFormDefinition = buildDefinition({})

  const mockVersionDocument = {
    formId,
    versionNumber: 1,
    formDefinition: mockFormDefinition,
    createdAt: now
  }

  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(db.collection).mockReturnValue(/** @type {any} */ (mockCollection))
  })

  describe('createVersion', () => {
    it('should create a new version', async () => {
      const insertedId = new ObjectId()
      mockCollection.insertOne.mockResolvedValue({
        insertedId,
        acknowledged: true
      })

      const result = await createVersion(mockVersionDocument, mockSession)

      expect(mockCollection.insertOne).toHaveBeenCalledWith(mockVersionDocument, { session: mockSession })
      expect(result).toEqual({
        ...mockVersionDocument,
        _id: insertedId
      })
    })

    it('should handle database errors', async () => {
      const error = new Error('Database error')
      mockCollection.insertOne.mockRejectedValue(error)

      await expect(createVersion(mockVersionDocument, mockSession)).rejects.toThrow(Boom.internal(error))
    })

    it('should throw non-Error objects directly', async () => {
      const error = 'String error'
      mockCollection.insertOne.mockRejectedValue(error)

      await expect(createVersion(mockVersionDocument, mockSession)).rejects.toBe(error)
    })
  })

  describe('getLatestVersionNumber', () => {
    it('should return the latest version number', async () => {
      mockCollection.findOne.mockResolvedValue({ versionNumber: 5 })

      const result = await getLatestVersionNumber(formId)

      expect(mockCollection.findOne).toHaveBeenCalledWith(
        { formId },
        {
          sort: { versionNumber: -1 },
          projection: { versionNumber: 1 }
        }
      )
      expect(result).toBe(5)
    })

    it('should return 0 when no versions exist', async () => {
      mockCollection.findOne.mockResolvedValue(null)

      const result = await getLatestVersionNumber(formId)

      expect(result).toBe(0)
    })

    it('should handle database errors', async () => {
      const error = new Error('Database error')
      mockCollection.findOne.mockRejectedValue(error)

      await expect(getLatestVersionNumber(formId)).rejects.toThrow(Boom.internal(error))
    })

    it('should throw non-Error objects directly', async () => {
      const error = 'String error'
      mockCollection.findOne.mockRejectedValue(error)

      await expect(getLatestVersionNumber(formId)).rejects.toBe(error)
    })

    it('should work with session parameter', async () => {
      mockCollection.findOne.mockResolvedValue({ versionNumber: 3 })

      const result = await getLatestVersionNumber(formId, mockSession)

      expect(mockCollection.findOne).toHaveBeenCalledWith(
        { formId },
        {
          sort: { versionNumber: -1 },
          projection: { versionNumber: 1 },
          session: mockSession
        }
      )
      expect(result).toBe(3)
    })
  })

  describe('getVersion', () => {
    const versionNumber = 1

    it('should retrieve a specific version', async () => {
      mockCollection.findOne.mockResolvedValue(mockVersionDocument)

      const result = await getVersion(formId, versionNumber)

      expect(mockCollection.findOne).toHaveBeenCalledWith({ formId, versionNumber }, undefined)
      expect(result).toEqual(mockVersionDocument)
    })

    it('should throw Boom.notFound when version not found', async () => {
      mockCollection.findOne.mockResolvedValue(null)

      await expect(getVersion(formId, versionNumber)).rejects.toThrow(
        Boom.notFound(`Version ${versionNumber} for form ID '${formId}' not found`)
      )
    })

    it('should handle database errors (non-Boom)', async () => {
      const error = new Error('Database error')
      mockCollection.findOne.mockRejectedValue(error)

      await expect(getVersion(formId, versionNumber)).rejects.toThrow(Boom.internal(error))
    })

    it('should throw non-Error objects directly', async () => {
      const error = 'String error'
      mockCollection.findOne.mockRejectedValue(error)

      await expect(getVersion(formId, versionNumber)).rejects.toBe(error)
    })

    it('should work with session parameter', async () => {
      mockCollection.findOne.mockResolvedValue(mockVersionDocument)

      const result = await getVersion(formId, versionNumber, mockSession)

      expect(mockCollection.findOne).toHaveBeenCalledWith({ formId, versionNumber }, { session: mockSession })
      expect(result).toEqual(mockVersionDocument)
    })
  })

  describe('getLatestVersion', () => {
    it('should retrieve the latest version', async () => {
      mockCollection.findOne.mockResolvedValue(mockVersionDocument)

      const result = await getLatestVersion(formId)

      expect(mockCollection.findOne).toHaveBeenCalledWith({ formId }, { sort: { versionNumber: -1 } })
      expect(result).toEqual(mockVersionDocument)
    })

    it('should return null when no versions exist', async () => {
      mockCollection.findOne.mockResolvedValue(null)

      const result = await getLatestVersion(formId)

      expect(result).toBeNull()
    })

    it('should handle database errors', async () => {
      const error = new Error('Database error')
      mockCollection.findOne.mockRejectedValue(error)

      await expect(getLatestVersion(formId)).rejects.toThrow(Boom.internal(error))
    })

    it('should throw non-Error objects directly', async () => {
      const error = 'String error'
      mockCollection.findOne.mockRejectedValue(error)

      await expect(getLatestVersion(formId)).rejects.toBe(error)
    })

    it('should work with session parameter', async () => {
      mockCollection.findOne.mockResolvedValue(mockVersionDocument)

      const result = await getLatestVersion(formId, mockSession)

      expect(mockCollection.findOne).toHaveBeenCalledWith(
        { formId },
        { sort: { versionNumber: -1 }, session: mockSession }
      )
      expect(result).toEqual(mockVersionDocument)
    })
  })

  describe('getVersions', () => {
    const mockVersions = [
      { ...mockVersionDocument, versionNumber: 3 },
      { ...mockVersionDocument, versionNumber: 2 },
      { ...mockVersionDocument, versionNumber: 1 }
    ]

    beforeEach(() => {
      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue(mockVersions)
      })
      mockCollection.countDocuments.mockResolvedValue(3)
    })

    it('should retrieve paginated versions', async () => {
      const result = await getVersions(formId)

      expect(mockCollection.find).toHaveBeenCalledWith({ formId }, undefined)
      expect(result).toEqual({ versions: mockVersions, totalCount: 3 })
    })

    it('should handle database errors', async () => {
      const error = new Error('Database error')
      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockRejectedValue(error)
      })

      await expect(getVersions(formId)).rejects.toThrow(Boom.internal(error))
    })

    it('should throw non-Error objects directly', async () => {
      const error = 'String error'
      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockRejectedValue(error)
      })

      await expect(getVersions(formId)).rejects.toBe(error)
    })

    it('should work with session parameter', async () => {
      const result = await getVersions(formId, mockSession, 5, 10)

      expect(mockCollection.find).toHaveBeenCalledWith({ formId }, { session: mockSession })
      expect(result).toEqual({ versions: mockVersions, totalCount: 3 })
    })
  })

  describe('removeVersionsForForm', () => {
    it('should remove all versions for a form', async () => {
      mockCollection.deleteMany.mockResolvedValue({
        deletedCount: 5,
        acknowledged: true
      })

      await removeVersionsForForm(formId, mockSession)

      expect(mockCollection.deleteMany).toHaveBeenCalledWith({ formId }, { session: mockSession })
    })

    it('should handle database errors', async () => {
      const error = new Error('Database error')
      mockCollection.deleteMany.mockRejectedValue(error)

      await expect(removeVersionsForForm(formId, mockSession)).rejects.toThrow(Boom.internal(error))
    })

    it('should throw non-Error objects directly', async () => {
      const error = 'String error'
      mockCollection.deleteMany.mockRejectedValue(error)

      await expect(removeVersionsForForm(formId, mockSession)).rejects.toBe(error)
    })
  })

  describe('getVersionSummaries', () => {
    it('should retrieve version summaries for a form', async () => {
      const mockVersions = [
        { versionNumber: 2, createdAt: now },
        { versionNumber: 1, createdAt: new Date(now.getTime() - 1000) }
      ]
      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue(mockVersions)
        })
      })

      const result = await getVersionSummaries(formId)

      expect(result).toEqual(mockVersions)
      expect(mockCollection.find).toHaveBeenCalledWith(
        { formId },
        { projection: { versionNumber: 1, createdAt: 1, _id: 0 } }
      )
    })

    it('should handle database errors', async () => {
      const error = new Error('Database error')
      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          toArray: jest.fn().mockRejectedValue(error)
        })
      })

      await expect(getVersionSummaries(formId)).rejects.toThrow(Boom.internal(error))
    })

    it('should throw non-Error objects directly', async () => {
      const error = 'String error'
      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          toArray: jest.fn().mockRejectedValue(error)
        })
      })

      await expect(getVersionSummaries(formId)).rejects.toBe(error)
    })

    it('should work with session parameter', async () => {
      const mockVersions = [
        { versionNumber: 2, createdAt: now },
        { versionNumber: 1, createdAt: new Date(now.getTime() - 1000) }
      ]
      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue(mockVersions)
        })
      })

      const result = await getVersionSummaries(formId, mockSession)

      expect(result).toEqual(mockVersions)
      expect(mockCollection.find).toHaveBeenCalledWith(
        { formId },
        {
          projection: { versionNumber: 1, createdAt: 1, _id: 0 },
          session: mockSession
        }
      )
    })
  })

  describe('getVersionSummariesBatch', () => {
    it('should retrieve version summaries for multiple forms', async () => {
      const formIds = ['form1', 'form2']
      const mockVersions = [
        { formId: 'form1', versionNumber: 1, createdAt: now },
        { formId: 'form2', versionNumber: 1, createdAt: now }
      ]
      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue(mockVersions)
        })
      })

      const result = await getVersionSummariesBatch(formIds)

      expect(result).toBeInstanceOf(Map)
      expect(result.get('form1')).toEqual([{ versionNumber: 1, createdAt: now }])
      expect(result.get('form2')).toEqual([{ versionNumber: 1, createdAt: now }])
    })

    it('should handle database errors', async () => {
      const formIds = ['form1', 'form2']
      const error = new Error('Database error')
      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          toArray: jest.fn().mockRejectedValue(error)
        })
      })

      await expect(getVersionSummariesBatch(formIds)).rejects.toThrow(Boom.internal(error))
    })

    it('should throw non-Error objects directly', async () => {
      const formIds = ['form1', 'form2']
      const error = 'String error'
      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          toArray: jest.fn().mockRejectedValue(error)
        })
      })

      await expect(getVersionSummariesBatch(formIds)).rejects.toBe(error)
    })

    it('should work with session parameter', async () => {
      const formIds = ['form1', 'form2']
      const mockVersions = [
        { formId: 'form1', versionNumber: 1, createdAt: now },
        { formId: 'form2', versionNumber: 1, createdAt: now }
      ]
      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue(mockVersions)
        })
      })

      const result = await getVersionSummariesBatch(formIds, mockSession)

      expect(result).toBeInstanceOf(Map)
      expect(result.get('form1')).toEqual([{ versionNumber: 1, createdAt: now }])
      expect(result.get('form2')).toEqual([{ versionNumber: 1, createdAt: now }])
      expect(mockCollection.find).toHaveBeenCalledWith(
        { formId: { $in: formIds } },
        {
          projection: { formId: 1, versionNumber: 1, createdAt: 1, _id: 0 },
          session: mockSession
        }
      )
    })

    it('should handle versions with unexpected formIds', async () => {
      const formIds = ['form1', 'form2']
      const mockVersions = [
        { formId: 'form1', versionNumber: 1, createdAt: now },
        { formId: 'form3', versionNumber: 1, createdAt: now } // form3 not in formIds array
      ]
      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue(mockVersions)
        })
      })

      const result = await getVersionSummariesBatch(formIds, mockSession)

      expect(result).toBeInstanceOf(Map)
      expect(result.get('form1')).toEqual([{ versionNumber: 1, createdAt: now }])
      expect(result.get('form2')).toEqual([])
      expect(result.get('form3')).toEqual([{ versionNumber: 1, createdAt: now }])
    })
  })

  describe('constants', () => {
    it('should export MAX_VERSIONS constant', () => {
      expect(MAX_VERSIONS).toBe(100)
    })
  })
})

/**
 * @import { FormVersionDocument } from '~/src/api/types.js'
 */
