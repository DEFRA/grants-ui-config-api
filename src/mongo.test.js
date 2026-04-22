import { MongoClient } from 'mongodb'

import { config } from '~/src/config/index.js'
import { METADATA_COLLECTION_NAME, VERSIONS_COLLECTION_NAME, prepareDb } from '~/src/mongo.js'

jest.mock('mongodb', () => ({
  MongoClient: {
    connect: jest.fn()
  }
}))

jest.mock('~/src/config/index.js', () => ({
  config: { get: jest.fn() }
}))

// Default: secureContext is truthy (as it would be in a deployed environment)
jest.mock('~/src/secure-context.js', () => ({
  secureContext: { ca: 'mock-certificate' }
}))

describe('mongo', () => {
  const mockLogger = /** @type {any} */ ({ info: jest.fn(), error: jest.fn() })

  const mockCreateIndex = jest.fn()
  const mockMetadataCollection = { createIndex: mockCreateIndex }
  const mockVersionsCollection = { createIndex: mockCreateIndex }
  const mockDb = { collection: jest.fn() }
  const mockClient = { db: jest.fn() }

  beforeEach(() => {
    jest.clearAllMocks()
    mockCreateIndex.mockResolvedValue({})
    mockDb.collection.mockImplementation((name) => {
      if (name === METADATA_COLLECTION_NAME) return mockMetadataCollection
      return mockVersionsCollection
    })
    mockClient.db.mockReturnValue(mockDb)
    jest.mocked(MongoClient.connect).mockResolvedValue(/** @type {any} */ (mockClient))
    jest.mocked(config.get).mockImplementation(
      (key) =>
        /** @type {Record<string, any>} */ ({
          'mongo.uri': 'mongodb://localhost:27017',
          'mongo.databaseName': 'test-db',
          isSecureContextEnabled: false
        })[/** @type {string} */ (key)]
    )
  })

  describe('prepareDb', () => {
    it('connects to MongoDB, creates all indexes, and returns the db', async () => {
      const result = await prepareDb(mockLogger)

      expect(MongoClient.connect).toHaveBeenCalledWith(
        'mongodb://localhost:27017',
        expect.objectContaining({ retryWrites: false, readPreference: 'primary' })
      )
      expect(mockClient.db).toHaveBeenCalledWith('test-db')
      expect(result).toBe(mockDb)

      // form-metadata indexes
      expect(mockCreateIndex).toHaveBeenCalledWith({ title: 1 })
      expect(mockCreateIndex).toHaveBeenCalledWith({ slug: 1 }, { unique: true })

      // form-versions indexes
      expect(mockCreateIndex).toHaveBeenCalledWith({ formId: 1 })
      expect(mockCreateIndex).toHaveBeenCalledWith({ formId: 1, versionNumber: 1 }, { unique: true })
      expect(mockCreateIndex).toHaveBeenCalledWith({ formId: 1, versionNumber: -1 })
      expect(mockCreateIndex).toHaveBeenCalledWith({ createdAt: -1 })
      expect(mockCreateIndex).toHaveBeenCalledWith({ formId: 1, status: 1 })
    })

    it('does not include secureContext when isSecureContextEnabled is false', async () => {
      await prepareDb(mockLogger)

      expect(MongoClient.connect).toHaveBeenCalledWith(
        expect.any(String),
        expect.not.objectContaining({ secureContext: expect.anything() })
      )
    })

    it('includes secureContext in options when isSecureContextEnabled is true', async () => {
      jest.mocked(config.get).mockImplementation(
        (key) =>
          /** @type {Record<string, any>} */ ({
            'mongo.uri': 'mongodb://localhost:27017',
            'mongo.databaseName': 'test-db',
            isSecureContextEnabled: true
          })[/** @type {string} */ (key)]
      )

      await prepareDb(mockLogger)

      expect(MongoClient.connect).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ secureContext: { ca: 'mock-certificate' } })
      )
    })

    it('propagates errors thrown by MongoClient.connect', async () => {
      const error = new Error('Connection refused')
      jest.mocked(MongoClient.connect).mockRejectedValue(error)

      await expect(prepareDb(mockLogger)).rejects.toThrow(error)
    })
  })

  describe('constants', () => {
    it('exports the correct collection name constants', () => {
      expect(METADATA_COLLECTION_NAME).toBe('form-metadata')
      expect(VERSIONS_COLLECTION_NAME).toBe('form-versions')
    })
  })
})
