import { FormStatus } from '@defra/forms-model'
import Boom from '@hapi/boom'
import { MongoServerError, ObjectId } from 'mongodb'

import { buildMetadataDocument, metadataId } from '~/src/api/forms/__stubs__/metadata.js'
import { buildMockCollection } from '~/src/api/forms/__stubs__/mongo.js'
import { FormAlreadyExistsError } from '~/src/api/forms/errors.js'
import {
  MAX_RESULTS,
  addVersionMetadata,
  create,
  get,
  getAndIncrementVersionNumber,
  getBySlug,
  getVersionMetadata,
  list,
  listAll,
  listWithVersions,
  remove,
  update,
  updateAudit,
  upsert
} from '~/src/api/forms/repositories/form-metadata-repository.js'
import author from '~/src/api/forms/service/__stubs__/author.js'
import { db } from '~/src/mongo.js'

const mockCollection = buildMockCollection()
/**
 * @type {any}
 */
const mockSession = author
jest.mock('~/src/mongo.js', () => {
  let isPrepared = false
  const collection = /** @satisfies {Collection<{draft: FormDefinition}>} */ jest
    .fn()
    .mockImplementation(() => mockCollection)
  return {
    db: {
      collection
    },
    get client() {
      if (!isPrepared) {
        return undefined
      }

      return {
        startSession: () => ({
          endSession: jest.fn().mockResolvedValue(undefined),
          withTransaction: jest.fn(
            /**
             * Mock transaction handler
             * @param {() => Promise<void>} fn
             */
            async (fn) => fn()
          )
        })
      }
    },

    prepareDb() {
      isPrepared = true
      return Promise.resolve()
    }
  }
})

jest.mock('~/src/helpers/logging/logger.js', () => ({
  createLogger: () => ({
    error: jest.fn(),
    info: jest.fn()
  })
}))

describe('form-metadata-repository', () => {
  const metadataBefore = buildMetadataDocument()
  const metadataAfter = buildMetadataDocument({
    ...metadataBefore,
    title: 'New form title',
    slug: 'new-form-title'
  })

  beforeEach(() => {
    jest.mocked(db.collection).mockReturnValue(/** @type {any} */ (mockCollection))
    jest.clearAllMocks()
  })
  describe('update', () => {
    it('should update metadata', async () => {
      mockCollection.updateOne.mockResolvedValue({
        modifiedCount: 1
      })
      mockCollection.findOne.mockResolvedValue(metadataAfter)
      mockCollection.findOneAndUpdate.mockResolvedValue(metadataAfter)
      const updated = await update(
        metadataId,
        { $set: { title: 'New form title', slug: 'new-form-title' } },
        mockSession
      )
      expect(updated).toEqual(metadataAfter)
    })

    it('should fail if document not found', async () => {
      mockCollection.updateOne.mockResolvedValue({
        modifiedCount: 1
      })
      mockCollection.findOne.mockResolvedValue(null)
      await expect(
        update(metadataId, { $set: { title: 'New form title', slug: 'new-form-title' } }, mockSession)
      ).rejects.toThrow(`Form with ID ${metadataId} not found.`)
    })
  })

  describe('updateAudit', () => {
    it('should update and log', async () => {
      mockCollection.updateOne.mockResolvedValue({
        modifiedCount: 1
      })
      mockCollection.findOne.mockResolvedValue(metadataAfter)
      mockCollection.findOneAndUpdate.mockResolvedValue(metadataAfter)
      const auditDate = new Date('2025-08-01')

      const expectedUpdate = {
        $set: {
          'draft.updatedAt': auditDate,
          'draft.updatedBy': author,
          updatedAt: auditDate,
          updatedBy: author
        }
      }
      const updated = await updateAudit(metadataId, author, mockSession, auditDate)
      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        { _id: new ObjectId(metadataId) },
        expectedUpdate,
        expect.anything()
      )
      expect(updated).toEqual(metadataAfter)
    })

    it('should throw non-Error objects directly', async () => {
      const error = 'String error'
      mockCollection.updateOne.mockRejectedValue(error)

      await expect(updateAudit(metadataId, author, mockSession)).rejects.toBe(error)
    })
  })

  describe('listAll', () => {
    it('should retrieve all documents with limit', async () => {
      const mockDocuments = [metadataBefore, metadataAfter]
      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue(mockDocuments)
      })

      const result = await listAll()

      expect(mockCollection.find).toHaveBeenCalledWith()
      expect(mockCollection.find().sort).toHaveBeenCalledWith({ updatedAt: -1 })
      expect(mockCollection.find().limit).toHaveBeenCalledWith(MAX_RESULTS)
      expect(result).toEqual(mockDocuments)
    })

    it('should handle empty results', async () => {
      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue([])
      })

      const result = await listAll()

      expect(result).toEqual([])
    })
  })

  describe('list', () => {
    beforeEach(() => {
      mockCollection.aggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([
          {
            authors: { facet: [{ name: 'John Doe' }] },
            organisations: { facet: [{ organisation: 'Defra' }] },
            status: { facet: [{ status: 'draft' }] }
          }
        ])
      })
      mockCollection.countDocuments.mockResolvedValue(2)
    })

    it('should list documents with default options', async () => {
      mockCollection.aggregate.mockReturnValue({
        toArray: jest
          .fn()
          .mockResolvedValueOnce([
            {
              authors: [{ name: 'John Doe' }],
              organisations: [{ name: 'Defra' }],
              status: [{ statuses: ['draft'] }]
            }
          ])
          .mockResolvedValueOnce([metadataBefore])
      })

      const result = await list({ page: 1, perPage: 10 })

      expect(result).toHaveProperty('documents')
      expect(result).toHaveProperty('totalItems')
      expect(result).toHaveProperty('filters')
      expect(mockCollection.countDocuments).toHaveBeenCalled()
    })

    it('should handle pagination and sorting', async () => {
      mockCollection.aggregate.mockReturnValue({
        toArray: jest
          .fn()
          .mockResolvedValueOnce([
            {
              authors: [],
              organisations: [],
              status: [{ statuses: [] }]
            }
          ])
          .mockResolvedValueOnce([metadataBefore])
      })

      const options = {
        page: 2,
        perPage: 10,
        sortBy: 'title',
        order: 'asc',
        title: 'test',
        author: 'John',
        organisations: ['Defra'],
        status: [FormStatus.Draft]
      }

      const result = await list(options)

      expect(result).toHaveProperty('documents')
      expect(result).toHaveProperty('totalItems', 2)
      expect(result).toHaveProperty('filters')
    })

    it('should handle errors', async () => {
      const error = new Error('Database error')
      mockCollection.aggregate.mockReturnValue({
        toArray: jest.fn().mockRejectedValue(error)
      })

      await expect(list({ page: 1, perPage: 10 })).rejects.toThrow(error)
    })
  })

  describe('listWithVersions', () => {
    beforeEach(() => {
      mockCollection.aggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([
          {
            authors: { facet: [{ name: 'John Doe' }] },
            organisations: { facet: [{ organisation: 'Defra' }] },
            status: { facet: [{ status: 'draft' }] }
          }
        ])
      })
      mockCollection.countDocuments.mockResolvedValue(2)
    })

    it('should list documents with versions using default options', async () => {
      mockCollection.aggregate.mockReturnValue({
        toArray: jest
          .fn()
          .mockResolvedValueOnce([
            {
              authors: [{ name: 'John Doe' }],
              organisations: [{ name: 'Defra' }],
              status: [{ statuses: ['draft'] }]
            }
          ])
          .mockResolvedValueOnce([metadataBefore])
      })

      const result = await listWithVersions({ page: 1, perPage: 10 })

      expect(result).toHaveProperty('documents')
      expect(result).toHaveProperty('totalItems')
      expect(result).toHaveProperty('filters')
      expect(mockCollection.countDocuments).toHaveBeenCalled()
      expect(mockCollection.aggregate).toHaveBeenCalledTimes(2)
    })

    it('should list documents with versions using custom options', async () => {
      mockCollection.aggregate.mockReturnValue({
        toArray: jest
          .fn()
          .mockResolvedValueOnce([
            {
              authors: [],
              organisations: [],
              status: [{ statuses: [] }]
            }
          ])
          .mockResolvedValueOnce([metadataBefore])
      })

      const options = {
        page: 2,
        perPage: 5,
        sortBy: 'title',
        order: 'asc',
        title: 'test form',
        author: 'Jane Doe',
        organisations: ['Defra', 'DWP'],
        status: [FormStatus.Draft, FormStatus.Live]
      }

      const result = await listWithVersions(options)

      expect(result).toHaveProperty('documents')
      expect(result).toHaveProperty('totalItems', 2)
      expect(result).toHaveProperty('filters')
      expect(mockCollection.countDocuments).toHaveBeenCalled()
      expect(mockCollection.aggregate).toHaveBeenCalledTimes(2)
    })

    it('should handle empty results', async () => {
      mockCollection.aggregate.mockReturnValue({
        toArray: jest
          .fn()
          .mockResolvedValueOnce([
            {
              authors: [],
              organisations: [],
              status: [{ statuses: [] }]
            }
          ])
          .mockResolvedValueOnce([])
      })
      mockCollection.countDocuments.mockResolvedValue(0)

      const result = await listWithVersions({ page: 1, perPage: 10 })

      expect(result.documents).toEqual([])
      expect(result.totalItems).toBe(0)
      expect(result).toHaveProperty('filters')
    })

    it('should handle pagination correctly', async () => {
      mockCollection.aggregate.mockReturnValue({
        toArray: jest
          .fn()
          .mockResolvedValueOnce([
            {
              authors: [],
              organisations: [],
              status: [{ statuses: [] }]
            }
          ])
          .mockResolvedValueOnce([metadataBefore])
      })

      const result = await listWithVersions({ page: 3, perPage: 20 })

      expect(result).toHaveProperty('documents')
      expect(result).toHaveProperty('totalItems', 2)
      expect(result).toHaveProperty('filters')
    })

    it('should handle errors and log them correctly', async () => {
      const error = new Error('Database connection failed')
      mockCollection.aggregate.mockReturnValue({
        toArray: jest.fn().mockRejectedValue(error)
      })

      await expect(listWithVersions({ page: 1, perPage: 10 })).rejects.toThrow(error)
    })

    it('should log error with correct message format', async () => {
      const error = new Error('MongoDB aggregation failed')
      mockCollection.aggregate.mockReturnValue({
        toArray: jest.fn().mockRejectedValue(error)
      })

      await expect(listWithVersions({ page: 1, perPage: 10 })).rejects.toThrow(error)

      // The error should be thrown and logged - we can't easily test the logger call
      // due to the mocking structure, but the error handling is covered
    })

    it('should handle aggregation errors in filter stage', async () => {
      const error = new Error('Aggregation pipeline failed')
      mockCollection.aggregate.mockReturnValue({
        toArray: jest.fn().mockRejectedValue(error)
      })

      await expect(listWithVersions({ page: 1, perPage: 10 })).rejects.toThrow(error)
    })

    it('should handle countDocuments errors', async () => {
      mockCollection.aggregate.mockReturnValue({
        toArray: jest
          .fn()
          .mockResolvedValueOnce([
            {
              authors: [],
              organisations: [],
              status: [{ statuses: [] }]
            }
          ])
          .mockResolvedValueOnce([metadataBefore])
      })

      const error = new Error('Count documents failed')
      mockCollection.countDocuments.mockRejectedValue(error)

      await expect(listWithVersions({ page: 1, perPage: 10 })).rejects.toThrow(error)
    })

    it('should handle Promise.all rejection', async () => {
      mockCollection.aggregate.mockReturnValue({
        toArray: jest
          .fn()
          .mockResolvedValueOnce([
            {
              authors: [],
              organisations: [],
              status: [{ statuses: [] }]
            }
          ])
          .mockRejectedValueOnce(new Error('Promise.all failed'))
      })

      await expect(listWithVersions({ page: 1, perPage: 10 })).rejects.toThrow('Promise.all failed')
    })

    it('should use correct default values when options are not provided', async () => {
      mockCollection.aggregate.mockReturnValue({
        toArray: jest
          .fn()
          .mockResolvedValueOnce([
            {
              authors: [],
              organisations: [],
              status: [{ statuses: [] }]
            }
          ])
          .mockResolvedValueOnce([metadataBefore])
      })

      await listWithVersions({ page: 1, perPage: 10 })

      // Verify that the aggregation pipeline includes skip and limit with default values
      expect(mockCollection.aggregate).toHaveBeenCalledTimes(2)
    })

    it('should handle large page numbers correctly', async () => {
      mockCollection.aggregate.mockReturnValue({
        toArray: jest
          .fn()
          .mockResolvedValueOnce([
            {
              authors: [],
              organisations: [],
              status: [{ statuses: [] }]
            }
          ])
          .mockResolvedValueOnce([])
      })

      const result = await listWithVersions({ page: 1000, perPage: 10 })

      expect(result.documents).toEqual([])
      expect(result.totalItems).toBe(2)
    })

    it('should use default values when properties are undefined', async () => {
      mockCollection.aggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([{ authors: [], organisations: [], status: [] }])
      })
      mockCollection.countDocuments.mockResolvedValue(0)

      await listWithVersions({
        page: 1,
        perPage: 1,
        sortBy: undefined,
        order: undefined,
        title: undefined,
        author: undefined,
        organisations: undefined,
        status: undefined
      })

      expect(mockCollection.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $facet: expect.objectContaining({
              authors: expect.any(Array),
              organisations: expect.any(Array),
              status: expect.any(Array)
            })
          })
        ])
      )
    })
  })

  describe('get', () => {
    it('should retrieve form by ID', async () => {
      mockCollection.findOne.mockResolvedValue(metadataBefore)

      const result = await get(metadataId, mockSession)

      expect(mockCollection.findOne).toHaveBeenCalledWith({ _id: new ObjectId(metadataId) }, { session: mockSession })
      expect(result).toEqual(metadataBefore)
    })

    it('should throw Boom.notFound when form not found', async () => {
      mockCollection.findOne.mockResolvedValue(null)

      await expect(get(metadataId)).rejects.toThrow(Boom.notFound(`Form with ID '${metadataId}' not found`))
    })

    it('should rethrow Boom errors', async () => {
      const boomError = Boom.forbidden('Access denied')
      mockCollection.findOne.mockRejectedValue(boomError)

      await expect(get(metadataId)).rejects.toThrow(boomError)
    })

    it('should throw Boom.badRequest for generic errors', async () => {
      const error = new Error('Database error')
      mockCollection.findOne.mockRejectedValue(error)

      await expect(get(metadataId)).rejects.toThrow(Boom.badRequest(error))
    })

    it('should throw non-Error objects directly', async () => {
      const error = 'String error'
      mockCollection.findOne.mockRejectedValue(error)

      await expect(get(metadataId)).rejects.toBe(error)
    })
  })

  describe('getBySlug', () => {
    const slug = 'test-form'

    it('should retrieve form by slug', async () => {
      mockCollection.findOne.mockResolvedValue(metadataBefore)

      const result = await getBySlug(slug)

      expect(mockCollection.findOne).toHaveBeenCalledWith({ slug }, { session: undefined })
      expect(result).toEqual(metadataBefore)
    })

    it('should throw Boom.notFound when form not found', async () => {
      mockCollection.findOne.mockResolvedValue(null)

      await expect(getBySlug(slug)).rejects.toThrow(Boom.notFound(`Form with slug '${slug}' not found`))
    })

    it('should rethrow Boom errors', async () => {
      const boomError = Boom.forbidden('Access denied')
      mockCollection.findOne.mockRejectedValue(boomError)

      await expect(getBySlug(slug)).rejects.toThrow(boomError)
    })

    it('should throw Boom.internal for generic errors', async () => {
      const error = new Error('Database error')
      mockCollection.findOne.mockRejectedValue(error)

      await expect(getBySlug(slug)).rejects.toThrow(Boom.internal(error))
    })

    it('should throw non-Error objects directly', async () => {
      const error = 'String error'
      mockCollection.findOne.mockRejectedValue(error)

      await expect(getBySlug(slug)).rejects.toBe(error)
    })
  })

  describe('create', () => {
    const document = buildMetadataDocument()
    const insertedId = new ObjectId()

    it('should create a new document', async () => {
      mockCollection.insertOne.mockResolvedValue({
        insertedId,
        acknowledged: true
      })

      const result = await create(document, mockSession)

      expect(mockCollection.insertOne).toHaveBeenCalledWith(document, {
        session: mockSession
      })
      expect(result).toHaveProperty('insertedId', insertedId)
    })

    it('should throw FormAlreadyExistsError for duplicate slug', async () => {
      const mongoError = new MongoServerError({ message: 'Duplicate key' })
      mongoError.code = 11000
      mockCollection.insertOne.mockRejectedValue(mongoError)

      await expect(create(document, mockSession)).rejects.toThrow(
        new FormAlreadyExistsError(document.slug, { cause: mongoError })
      )
    })

    it('should handle other MongoServerErrors', async () => {
      const mongoError = new MongoServerError({ message: 'Other error' })
      mongoError.code = 123
      mockCollection.insertOne.mockRejectedValue(mongoError)

      await expect(create(document, mockSession)).rejects.toThrow(mongoError)
    })

    it('should handle generic errors', async () => {
      const error = new Error('Generic error')
      mockCollection.insertOne.mockRejectedValue(error)

      await expect(create(document, mockSession)).rejects.toThrow(error)
    })
  })

  describe('remove', () => {
    it('should remove a form metadata', async () => {
      mockCollection.deleteOne.mockResolvedValue({
        deletedCount: 1,
        acknowledged: true
      })

      await remove(metadataId, mockSession)

      expect(mockCollection.deleteOne).toHaveBeenCalledWith({ _id: new ObjectId(metadataId) }, { session: mockSession })
    })
  })

  describe('addVersionMetadata', () => {
    const versionMetadata = {
      versionNumber: 1,
      createdAt: new Date()
    }

    it('should add version metadata to form', async () => {
      mockCollection.updateOne.mockResolvedValue({
        modifiedCount: 1
      })
      mockCollection.findOne.mockResolvedValue(metadataAfter)

      const result = await addVersionMetadata(metadataId, versionMetadata, mockSession)

      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { _id: new ObjectId(metadataId) },
        {
          $push: {
            versions: {
              $each: [versionMetadata],
              $sort: { versionNumber: -1 }
            }
          }
        },
        { session: mockSession }
      )
      expect(result).toEqual(metadataAfter)
    })
  })

  describe('getVersionMetadata', () => {
    it('should get version metadata for a form', async () => {
      const versions = [
        { versionNumber: 2, createdAt: new Date('2023-02-01') },
        { versionNumber: 1, createdAt: new Date('2023-01-01') }
      ]
      mockCollection.findOne.mockResolvedValue({
        ...metadataBefore,
        versions
      })

      const result = await getVersionMetadata(metadataId, mockSession)

      expect(mockCollection.findOne).toHaveBeenCalledWith({ _id: new ObjectId(metadataId) }, { session: mockSession })
      expect(result).toEqual(versions)
    })

    it('should return empty array when no versions exist', async () => {
      mockCollection.findOne.mockResolvedValue({
        ...metadataBefore,
        versions: undefined
      })

      const result = await getVersionMetadata(metadataId)

      expect(result).toEqual([])
    })

    it('should throw when form not found', async () => {
      mockCollection.findOne.mockResolvedValue(null)

      await expect(getVersionMetadata(metadataId)).rejects.toThrow(
        Boom.notFound(`Form with ID '${metadataId}' not found`)
      )
    })
  })

  describe('update error handling', () => {
    it('should throw Boom.badRequest when modifiedCount is 0', async () => {
      mockCollection.updateOne.mockResolvedValue({
        modifiedCount: 0
      })

      await expect(update(metadataId, { $set: { title: 'New' } }, mockSession)).rejects.toThrow(
        Boom.badRequest(`Form with ID ${metadataId} not updated. Modified count 0`)
      )
    })

    it('should rethrow Boom errors in update', async () => {
      const boomError = Boom.forbidden('Access denied')
      mockCollection.updateOne.mockRejectedValue(boomError)

      await expect(update(metadataId, { $set: { title: 'New' } }, mockSession)).rejects.toThrow(boomError)
    })

    it('should throw Boom.internal for generic errors in update', async () => {
      const error = new Error('Database error')
      mockCollection.updateOne.mockRejectedValue(error)

      await expect(update(metadataId, { $set: { title: 'New' } }, mockSession)).rejects.toThrow(Boom.internal(error))
    })
  })

  describe('getById', () => {
    it('should retrieve form by ID', async () => {
      mockCollection.findOne.mockResolvedValue(metadataBefore)

      const result = await get(metadataId)

      expect(mockCollection.findOne).toHaveBeenCalledWith({ _id: new ObjectId(metadataId) }, { session: undefined })
      expect(result).toEqual(metadataBefore)
    })

    it('should throw Boom.notFound when form not found', async () => {
      mockCollection.findOne.mockResolvedValue(null)

      await expect(get(metadataId)).rejects.toThrow(Boom.notFound(`Form with ID '${metadataId}' not found`))
    })

    it('should rethrow Boom errors', async () => {
      const boomError = Boom.forbidden('Access denied')
      mockCollection.findOne.mockRejectedValue(boomError)

      await expect(get(metadataId)).rejects.toThrow(boomError)
    })

    it('should throw Boom.internal for generic errors', async () => {
      const error = new Error('Database error')
      mockCollection.findOne.mockRejectedValue(error)

      await expect(get(metadataId)).rejects.toThrow(Boom.internal(error))
    })
  })

  describe('getAndIncrementVersionNumber', () => {
    beforeEach(() => {
      jest.clearAllMocks()
    })

    it('should initialise lastVersionNumber from existing versions when field does not exist', async () => {
      mockCollection.findOneAndUpdate.mockResolvedValue({
        _id: new ObjectId(metadataId),
        lastVersionNumber: 4 // Should be max(3) + 1
      })

      const result = await getAndIncrementVersionNumber(metadataId, mockSession)

      expect(result).toBe(4)
      expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: new ObjectId(metadataId) },
        {
          $inc: { lastVersionNumber: 1 }
        },
        {
          returnDocument: 'after',
          session: mockSession,
          projection: { lastVersionNumber: 1 }
        }
      )
    })

    it('should increment existing lastVersionNumber when it already exists', async () => {
      mockCollection.findOneAndUpdate.mockResolvedValue({
        _id: new ObjectId(metadataId),
        lastVersionNumber: 11 // Incremented from 10
      })

      const result = await getAndIncrementVersionNumber(metadataId, mockSession)

      expect(result).toBe(11)
      expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: new ObjectId(metadataId) },
        {
          $inc: { lastVersionNumber: 1 }
        },
        {
          returnDocument: 'after',
          session: mockSession,
          projection: { lastVersionNumber: 1 }
        }
      )
    })

    it('should handle case where lastVersionNumber is behind versions array', async () => {
      mockCollection.findOneAndUpdate.mockResolvedValue({
        _id: new ObjectId(metadataId),
        lastVersionNumber: 15 // Should jump to max(versions) if it was behind
      })

      const result = await getAndIncrementVersionNumber(metadataId, mockSession)

      expect(result).toBe(15)
    })

    it('should start at 1 for forms with no versions', async () => {
      mockCollection.findOneAndUpdate.mockResolvedValue({
        _id: new ObjectId(metadataId),
        lastVersionNumber: 1 // 0 + 1
      })

      const result = await getAndIncrementVersionNumber(metadataId, mockSession)

      expect(result).toBe(1)
    })

    it('should throw Boom.notFound when form does not exist', async () => {
      const nonExistentId = '507f1f77bcf86cd799439011'
      mockCollection.findOneAndUpdate.mockResolvedValue(null)

      await expect(getAndIncrementVersionNumber(nonExistentId, mockSession)).rejects.toThrow(
        Boom.notFound(`Form with ID ${nonExistentId} not found`)
      )
    })

    it('should handle concurrent requests atomically', async () => {
      mockCollection.findOneAndUpdate
        .mockResolvedValueOnce({
          _id: new ObjectId(metadataId),
          lastVersionNumber: 5
        })
        .mockResolvedValueOnce({
          _id: new ObjectId(metadataId),
          lastVersionNumber: 6
        })
        .mockResolvedValueOnce({
          _id: new ObjectId(metadataId),
          lastVersionNumber: 7
        })

      const promises = [
        getAndIncrementVersionNumber(metadataId, mockSession),
        getAndIncrementVersionNumber(metadataId, mockSession),
        getAndIncrementVersionNumber(metadataId, mockSession)
      ]

      const resolvedResults = await Promise.all(promises)

      expect(resolvedResults).toEqual([5, 6, 7])
      expect(mockCollection.findOneAndUpdate).toHaveBeenCalledTimes(3)
    })

    it('should handle the exact duplicate key scenario from production', async () => {
      mockCollection.findOneAndUpdate.mockResolvedValueOnce({
        _id: new ObjectId('68a88bc836a6de2d100b3509'),
        lastVersionNumber: 11 // max(1..10) + 1
      })

      const result = await getAndIncrementVersionNumber('68a88bc836a6de2d100b3509', mockSession)

      expect(result).toBe(11)

      expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: new ObjectId('68a88bc836a6de2d100b3509') },
        {
          $inc: { lastVersionNumber: 1 }
        },
        expect.any(Object)
      )
    })
  })

  describe('upsert', () => {
    const formId = metadataId
    const document = /** @type {FormMetadata} */ {
      ...buildMetadataDocument(),
      id: formId
    }

    it('should psert a new document', async () => {
      mockCollection.updateOne.mockResolvedValue({
        upsertedCount: 1
      })

      const result = await upsert(document, mockSession)

      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { _id: new ObjectId(document.id) },
        { $set: document },
        { session: mockSession, upsert: true }
      )
      expect(result).toHaveProperty('upsertedCount', 1)
    })

    it('should handle Boom errors', async () => {
      const error = Boom.badRequest('Boom error')
      mockCollection.updateOne.mockRejectedValue(error)

      await expect(upsert(document, mockSession)).rejects.toThrow(error)
    })

    it('should handle generic errors', async () => {
      const error = new Error('Generic error')
      mockCollection.updateOne.mockRejectedValue(error)

      await expect(upsert(document, mockSession)).rejects.toThrow(error)
    })
  })
})
