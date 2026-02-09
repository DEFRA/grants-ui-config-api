import { createS3File, getS3Client } from '~/src/api/files/utils.js'

const s3Client = getS3Client()
/**
 * @param {string} key
 * @param {string} body
 */
const createS3Json = (key, body) => createS3File(key, body, 'application/json', s3Client)

const S3_KEY_BASE = 'audit-definitions/'

/**
 * @param {string} filename
 * @param {FormDefinition | List} entity
 * @returns {Promise<FormDefinitionS3Meta>}
 */
export async function saveToS3(filename, entity) {
  const body = JSON.stringify(entity)
  const s3Key = S3_KEY_BASE + filename
  const result = await createS3Json(s3Key, body)

  return {
    fileId: result.VersionId ?? '',
    filename,
    s3Key
  }
}

/**
 * @import { FormDefinition, FormDefinitionS3Meta, List } from '@defra/forms-model'
 */
