import { buildDefinition } from '@defra/forms-model/stubs'
import Boom from '@hapi/boom'
import { ObjectId } from 'mongodb'

import { buildMockCollection } from '~/src/api/forms/__stubs__/mongo.js'
import {
  MAX_VERSIONS,
  createVersion,
  getActiveVersions,
  getLatestVersion,
  getVersionBySemver,
  getVersionSummaries,
  getVersionSummariesBatch,
  getVersions,
  removeVersionsForForm,
  updateVersionStatus
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
    versionNumber: '1',
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
      { ...mockVersionDocument, versionNumber: '3' },
      { ...mockVersionDocument, versionNumber: '2' },
      { ...mockVersionDocument, versionNumber: '1' }
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
        { versionNumber: '2', createdAt: now },
        { versionNumber: '1', createdAt: new Date(now.getTime() - 1000) }
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
        { versionNumber: '2', createdAt: now },
        { versionNumber: '1', createdAt: new Date(now.getTime() - 1000) }
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
        { formId: 'form1', versionNumber: '1', createdAt: now },
        { formId: 'form2', versionNumber: '1', createdAt: now }
      ]
      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue(mockVersions)
        })
      })

      const result = await getVersionSummariesBatch(formIds)

      expect(result).toBeInstanceOf(Map)
      expect(result.get('form1')).toEqual([{ versionNumber: '1', createdAt: now }])
      expect(result.get('form2')).toEqual([{ versionNumber: '1', createdAt: now }])
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
        { formId: 'form1', versionNumber: '1', createdAt: now },
        { formId: 'form2', versionNumber: '1', createdAt: now }
      ]
      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue(mockVersions)
        })
      })

      const result = await getVersionSummariesBatch(formIds, mockSession)

      expect(result).toBeInstanceOf(Map)
      expect(result.get('form1')).toEqual([{ versionNumber: '1', createdAt: now }])
      expect(result.get('form2')).toEqual([{ versionNumber: '1', createdAt: now }])
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
        { formId: 'form1', versionNumber: '1', createdAt: now },
        { formId: 'form3', versionNumber: '1', createdAt: now } // form3 not in formIds array
      ]
      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue(mockVersions)
        })
      })

      const result = await getVersionSummariesBatch(formIds, mockSession)

      expect(result).toBeInstanceOf(Map)
      expect(result.get('form1')).toEqual([{ versionNumber: '1', createdAt: now }])
      expect(result.get('form2')).toEqual([])
      expect(result.get('form3')).toEqual([{ versionNumber: '1', createdAt: now }])
    })
  })

  describe('getVersionBySemver', () => {
    it('should return the version when found', async () => {
      mockCollection.findOne.mockResolvedValue(mockVersionDocument)

      const result = await getVersionBySemver(formId, '1.0.0')

      expect(mockCollection.findOne).toHaveBeenCalledWith({ formId, versionNumber: '1.0.0' }, undefined)
      expect(result).toEqual(mockVersionDocument)
    })

    it('should return null when the version does not exist', async () => {
      mockCollection.findOne.mockResolvedValue(null)

      const result = await getVersionBySemver(formId, '9.9.9')

      expect(result).toBeNull()
    })

    it('should work with session parameter', async () => {
      mockCollection.findOne.mockResolvedValue(mockVersionDocument)

      await getVersionBySemver(formId, '1.0.0', mockSession)

      expect(mockCollection.findOne).toHaveBeenCalledWith({ formId, versionNumber: '1.0.0' }, { session: mockSession })
    })

    it('should handle database errors', async () => {
      const error = new Error('Database error')
      mockCollection.findOne.mockRejectedValue(error)

      await expect(getVersionBySemver(formId, '1.0.0')).rejects.toThrow(Boom.internal(error))
    })

    it('should throw non-Error objects directly', async () => {
      const error = 'String error'
      mockCollection.findOne.mockRejectedValue(error)

      await expect(getVersionBySemver(formId, '1.0.0')).rejects.toBe(error)
    })
  })

  describe('getActiveVersions', () => {
    const mockActiveVersions = [{ ...mockVersionDocument, status: /** @type {'active'} */ ('active') }]

    beforeEach(() => {
      mockCollection.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(mockActiveVersions)
      })
    })

    it('should return active versions', async () => {
      const result = await getActiveVersions(formId)

      expect(mockCollection.find).toHaveBeenCalledWith({ formId, status: 'active' }, undefined)
      expect(result).toEqual(mockActiveVersions)
    })

    it('should return an empty array when no active versions exist', async () => {
      mockCollection.find.mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) })

      const result = await getActiveVersions(formId)

      expect(result).toEqual([])
    })

    it('should work with session parameter', async () => {
      await getActiveVersions(formId, mockSession)

      expect(mockCollection.find).toHaveBeenCalledWith({ formId, status: 'active' }, { session: mockSession })
    })

    it('should handle database errors', async () => {
      const error = new Error('Database error')
      mockCollection.find.mockReturnValue({ toArray: jest.fn().mockRejectedValue(error) })

      await expect(getActiveVersions(formId)).rejects.toThrow(Boom.internal(error))
    })

    it('should throw non-Error objects directly', async () => {
      const error = 'String error'
      mockCollection.find.mockReturnValue({ toArray: jest.fn().mockRejectedValue(error) })

      await expect(getActiveVersions(formId)).rejects.toBe(error)
    })
  })

  describe('updateVersionStatus', () => {
    beforeEach(() => {
      mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 })
    })

    it('should update the version status', async () => {
      await updateVersionStatus(formId, '1.0.0', 'draft')

      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { formId, versionNumber: '1.0.0' },
        { $set: { status: 'draft' } },
        undefined
      )
    })

    it('should throw Boom.notFound when the version does not exist', async () => {
      mockCollection.updateOne.mockResolvedValue({ matchedCount: 0 })

      await expect(updateVersionStatus(formId, '9.9.9', 'active')).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 404 }
      })
    })

    it('should work with session parameter', async () => {
      await updateVersionStatus(formId, '1.0.0', 'active', mockSession)

      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { formId, versionNumber: '1.0.0' },
        { $set: { status: 'active' } },
        { session: mockSession }
      )
    })

    it('should rethrow Boom errors from updateOne', async () => {
      const boomError = Boom.badRequest('bad request')
      mockCollection.updateOne.mockRejectedValue(boomError)

      await expect(updateVersionStatus(formId, '1.0.0', 'active')).rejects.toBe(boomError)
    })

    it('should handle database errors', async () => {
      const error = new Error('Database error')
      mockCollection.updateOne.mockRejectedValue(error)

      await expect(updateVersionStatus(formId, '1.0.0', 'active')).rejects.toThrow(Boom.internal(error))
    })

    it('should throw non-Error objects directly', async () => {
      const error = 'String error'
      mockCollection.updateOne.mockRejectedValue(error)

      await expect(updateVersionStatus(formId, '1.0.0', 'active')).rejects.toBe(error)
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
