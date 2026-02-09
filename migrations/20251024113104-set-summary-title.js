/* eslint-disable no-console */
const LIVE = 'live'
const DRAFT = 'draft'

// Cannot import values from '@defra/forms-model' due to restrictions
const SummaryControllers = ['./pages/summary.js', 'SummaryPageController', 'SummaryPageWithConfirmationEmailController']
const CHECK_YOUR_ANSWERS_TITLE = 'Check your answers before sending your form'
const DEFINITION_COLLECTION_NAME = 'form-definition'
const BATCH_SIZE = 10

/**
 * @param {Collection<{ draft?: FormDefinition; live?: FormDefinition;}>} definitionCollection
 * @param {DRAFT | LIVE} draftOrLive
 */
async function getV2FormIdsToMigrate(definitionCollection, draftOrLive) {
  const query = {
    $and: [
      {
        [`${draftOrLive}.schema`]: 2
      },
      {
        [`${draftOrLive}.pages.controller`]: {
          $in: SummaryControllers
        }
      },
      {
        [`${draftOrLive}.pages.title`]: 'Summary'
      }
    ]
  }

  const projection =
    draftOrLive === DRAFT ? { projection: { draft: { name: 1 } } } : { projection: { live: { name: 1 } } }

  return await definitionCollection.find(query, projection).limit(BATCH_SIZE).toArray()
}

/**
 * @param {MongoClient} client
 * @param {Collection<{ draft?: FormDefinition; live?: FormDefinition;}>} definitionCollection
 * @param {DRAFT | LIVE} draftOrLive
 * @param {'v1' | 'v2'} version
 */
async function updateDefinitions(client, definitionCollection, draftOrLive, version) {
  let total = 0
  let updated = 0
  let errors = 0

  const session = client.startSession()

  await session.withTransaction(async () => {
    let formIdsToMigrate = []

    try {
      formIdsToMigrate = await getV2FormIdsToMigrate(definitionCollection, draftOrLive)

      total = formIdsToMigrate.length

      if (formIdsToMigrate.length === 0) {
        console.log(`No ${draftOrLive.toUpperCase()} ${version} forms found for migration`)
        return {
          updated,
          skipped: 0,
          errors,
          total
        }
      } else {
        console.log(`Found ${formIdsToMigrate.length} ${draftOrLive.toUpperCase()} ${version} forms for migration`)
      }

      for (const form of formIdsToMigrate) {
        const setExpr = {
          $set: {
            [`${draftOrLive}.pages.$[elem].title`]: version === 'v1' ? CHECK_YOUR_ANSWERS_TITLE : ''
          }
        }

        await definitionCollection.findOneAndUpdate({ _id: form._id }, setExpr, {
          arrayFilters: [
            {
              'elem.controller': {
                $in: SummaryControllers
              }
            }
          ]
        })
        updated++
        console.log(
          `Migrated ${version} ${draftOrLive.toUpperCase()} form ${form.draft?.name ?? form.live?.name} to use new summary title`
        )
      }
    } catch (error) {
      console.error(
        `Migration ${version} failed for ${draftOrLive}:`,
        error instanceof Error ? error.message : String(error)
      )
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
 * @param {'v1' | 'v2'} version
 */
async function migrateDraftOrLive(client, definitionCollection, draftOrLive, version) {
  const stats = {
    updated: 0,
    skipped: 0,
    errors: 0,
    total: 0
  }

  do {
    const res = await updateDefinitions(client, definitionCollection, draftOrLive, version)

    stats.updated += res.updated
    stats.skipped += res.skipped
    stats.errors += res.errors
    stats.total += res.total

    if (res.total === 0) {
      console.log(`\n=== Migration Summary (${draftOrLive.toUpperCase()}) ${version} ===`)
      console.log(`Total forms processed: ${stats.total}`)
      console.log(`Successfully migrated: ${stats.updated}`)
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
 * Changes any summary controllers from 'Summary' to 'SummaryWithConfirmationEmail'
 * @param {import('mongodb').Db} db
 * @param {import('mongodb').MongoClient} client
 * @returns {Promise<void>}
 */
export async function up(db, client) {
  const definitionCollection = db.collection(DEFINITION_COLLECTION_NAME)
  await migrateDraftOrLive(client, definitionCollection, DRAFT, 'v2')
  await migrateDraftOrLive(client, definitionCollection, LIVE, 'v2')
}

/**
 * This migration is a one-way data consolidation fix.
 * @returns {Promise<void>}
 */
export function down() {
  return Promise.reject(new Error('Migration rollback is not supported for data safety reasons'))
}

/**
 * @import { FormDefinition } from '@defra/forms-model'
 * @import { Collection, MongoClient, Db } from 'mongodb'
 */
