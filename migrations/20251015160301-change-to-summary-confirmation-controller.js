/* eslint-disable no-console */
const LIVE = 'live'
const DRAFT = 'draft'

// Cannot import values from '@defra/forms-model' due to restrictions
const ControllerTypeSummary = 'SummaryPageController'
const v1ControllerTypeSummary = './pages/summary.js'
const ControllerTypeSummaryWithConfirmationEmail = 'SummaryPageWithConfirmationEmailController'
const DEFINITION_COLLECTION_NAME = 'form-definition'
const BATCH_SIZE = 10

/**
 * @param {Collection<{ draft?: FormDefinition; live?: FormDefinition;}>} definitionCollection
 * @param {DRAFT | LIVE} draftOrLive
 */
async function getFormIdsToMigrate(definitionCollection, draftOrLive) {
  const query =
    draftOrLive === DRAFT
      ? {
          'draft.pages.controller': {
            $in: [ControllerTypeSummary, v1ControllerTypeSummary]
          }
        }
      : {
          'live.pages.controller': {
            $in: [ControllerTypeSummary, v1ControllerTypeSummary]
          }
        }

  const projection =
    draftOrLive === DRAFT ? { projection: { draft: { name: 1 } } } : { projection: { live: { name: 1 } } }

  return await definitionCollection.find(query, projection).limit(BATCH_SIZE).toArray()
}

/**
 * @param {MongoClient} client
 * @param {Collection<{ draft?: FormDefinition; live?: FormDefinition;}>} definitionCollection
 * @param {DRAFT | LIVE} draftOrLive
 */
async function updateDefinitions(client, definitionCollection, draftOrLive) {
  let total = 0
  let updated = 0
  let errors = 0

  const session = client.startSession()

  await session.withTransaction(async () => {
    let formIdsToMigrate = []

    try {
      formIdsToMigrate = await getFormIdsToMigrate(definitionCollection, draftOrLive)

      total = formIdsToMigrate.length

      if (formIdsToMigrate.length === 0) {
        console.log(`No ${draftOrLive.toUpperCase()} forms found for migration`)
        return {
          updated,
          skipped: 0,
          errors,
          total
        }
      } else {
        console.log(`Found ${formIdsToMigrate.length} ${draftOrLive.toUpperCase()} forms for migration`)
      }

      for (const form of formIdsToMigrate) {
        const setExpr =
          draftOrLive === DRAFT
            ? {
                $set: {
                  'draft.pages.$[elem].controller': ControllerTypeSummaryWithConfirmationEmail
                }
              }
            : {
                $set: {
                  'live.pages.$[elem].controller': ControllerTypeSummaryWithConfirmationEmail
                }
              }

        await definitionCollection.findOneAndUpdate({ _id: form._id }, setExpr, {
          arrayFilters: [
            {
              'elem.controller': {
                $in: [ControllerTypeSummary, v1ControllerTypeSummary]
              }
            }
          ]
        })
        updated++
        console.log(
          `Migrated ${draftOrLive.toUpperCase()} form ${form.draft?.name ?? form.live?.name} to use SummaryWithConfirmationEmail controller`
        )
      }
    } catch (error) {
      console.error(`Migration failed for ${draftOrLive}:`, error instanceof Error ? error.message : String(error))
      errors = formIdsToMigrate.length - updated
    } finally {
      await session.endSession()
    }
  })

  return {
    updated,
    skipped: total - updated - errors,
    errors,
    total
  }
}

/**
 * @param {MongoClient} client
 * @param {Collection<{ draft?: FormDefinition; live?: FormDefinition;}>} definitionCollection
 * @param {DRAFT | LIVE} draftOrLive
 */
async function migrateDraftOrLive(client, definitionCollection, draftOrLive) {
  const stats = {
    updated: 0,
    skipped: 0,
    errors: 0,
    total: 0
  }

  do {
    const res = await updateDefinitions(client, definitionCollection, draftOrLive)

    stats.updated += res.updated
    stats.skipped += res.skipped
    stats.errors += res.errors
    stats.total += res.total

    if (res.total === 0) {
      console.log(`\n=== Migration Summary (${draftOrLive.toUpperCase()}) ===`)
      console.log(`Total forms processed: ${stats.total}`)
      console.log(`Successfully migrated to new SummaryWithConfirmationEmail controller: ${stats.updated}`)
      console.log(`Skipped (already migrated): ${stats.skipped}`)
      console.log(`Errors: ${stats.errors}`)

      console.log(' ')
      console.log(' ')
      break
    }
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  } while (true)
}

/**
 * @import { FormDefinition } from '@defra/forms-model'
 * @import { Collection, MongoClient, Db } from 'mongodb'
 */

/**
 * Changes any summary controllers from 'Summary' to 'SummaryWithConfirmationEmail'
 * @param {import('mongodb').Db} db
 * @param {import('mongodb').MongoClient} client
 * @returns {Promise<void>}
 */
export async function up(db, client) {
  const definitionCollection = db.collection(DEFINITION_COLLECTION_NAME)
  await migrateDraftOrLive(client, definitionCollection, DRAFT)
  await migrateDraftOrLive(client, definitionCollection, LIVE)
}

/**
 * Rollback migration (not implemented)
 * @returns {Promise<void>}
 */
export function down() {
  return Promise.reject(new Error('Migration rollback is not supported for data safety reasons'))
}
