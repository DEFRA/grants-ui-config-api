/**
 * Upload a form YAML definition to the local S3 forms-config bucket.
 *
 * Usage:
 *   npm run upload:form-config -- <version> <file>
 *
 * Examples:
 *   npm run upload:form-config -- 0.0.5 /localstack/forms/example-grant-with-auth.yaml
 *   npm run upload:form-config -- 1.2.0 /path/to/farm-payments.yaml
 *
 * The slug is derived from the filename (without .yaml extension).
 * Uploads to: s3://<FORMS_CONFIG_BUCKET_NAME>/<slug>/<version>/grants-ui/<slug>.yaml
 *
 * Reads FORMS_CONFIG_BUCKET_NAME, S3_ENDPOINT, and AWS credentials from .env
 */

import { readFile } from 'fs/promises'
import { basename, extname, resolve } from 'path'

import 'dotenv/config'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

const [version, filePath] = process.argv.slice(2)

if (!version || !filePath) {
  console.error('Usage: npm run upload:form-config -- <version> <file>')
  console.error('  e.g. npm run upload:form-config -- 0.0.5 ./forms/example-grant-with-auth.yaml')
  process.exit(1)
}

const bucket = process.env.FORMS_CONFIG_BUCKET_NAME
const endpoint = process.env.S3_ENDPOINT

if (!bucket) {
  console.error('FORMS_CONFIG_BUCKET_NAME is not set. Add it to your .env file.')
  process.exit(1)
}

const slug = basename(filePath, extname(filePath))
const key = `${slug}/${version}/grants-ui/${slug}.yaml`
const absolutePath = resolve(filePath)

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? 'eu-west-2',
  ...(endpoint && {
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test'
    }
  })
})

console.log(`Uploading ${absolutePath}`)
console.log(`  → s3://${bucket}/${key}`)

const body = await readFile(absolutePath)

await s3.send(
  new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: 'application/yaml'
  })
)

console.log('Done.')
