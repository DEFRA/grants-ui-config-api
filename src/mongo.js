import { MongoClient } from 'mongodb'

import { config } from '~/src/config/index.js'
import { reinstateFeedbackForm } from '~/src/helpers/feedback-form/reinstate.js'
import { secureContext } from '~/src/secure-context.js'

/**
 * @type {Db}
 */
export let db

/**
 * @type {MongoClient}
 */
export let client

export const METADATA_COLLECTION_NAME = 'form-metadata'
export const DEFINITION_COLLECTION_NAME = 'form-definition'
export const VERSIONS_COLLECTION_NAME = 'form-versions'

/**
 * Connects to mongo database
 * @param {Logger} logger
 */
export async function prepareDb(logger) {
  const mongoUri = config.get('mongo.uri')
  const databaseName = config.get('mongo.databaseName')
  const isSecureContextEnabled = config.get('isSecureContextEnabled')

  logger.info('Setting up mongodb')

  client = await MongoClient.connect(
    mongoUri,
    /** @type {any} */ ({
      retryWrites: false,
      readPreference: 'primary',
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- secureContext can be undefined in non-production
      ...(isSecureContextEnabled && secureContext && { secureContext })
    })
  )

  db = client.db(databaseName)

  // Ensure db indexes
  const metadataCollection = db.collection(METADATA_COLLECTION_NAME)
  const versionsCollection = db.collection(VERSIONS_COLLECTION_NAME)

  await metadataCollection.createIndex({ title: 1 })
  await metadataCollection.createIndex({ slug: 1 }, { unique: true })

  // Create indexes for form versions collection
  await versionsCollection.createIndex({ formId: 1 })
  await versionsCollection.createIndex({ formId: 1, versionNumber: 1 }, { unique: true })
  await versionsCollection.createIndex({ formId: 1, versionNumber: -1 })
  await versionsCollection.createIndex({ createdAt: -1 })

  // Ensure feedback form exists, and is same as the JSON in the codebase
  await reinstateFeedbackForm(client, logger)

  logger.info(`Mongodb connected to ${databaseName}`)

  return db
}

/**
 * @import { Db } from 'mongodb'
 * @import { Logger } from 'pino'
 */
