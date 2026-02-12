import { cwd } from 'process'

import 'dotenv/config'
import convict from 'convict'

const isProduction = process.env.NODE_ENV === 'production'
const isDev = process.env.NODE_ENV !== 'production'
const isTest = process.env.NODE_ENV === 'test'

export const config = convict({
  env: {
    doc: 'The application environment.',
    format: ['production', 'development', 'test'],
    default: 'development',
    env: 'NODE_ENV'
  },
  host: {
    doc: 'The IP address to bind',
    format: String,
    default: '0.0.0.0',
    env: 'HOST'
  },
  port: {
    doc: 'The port to bind.',
    format: 'port',
    default: 3001,
    env: 'PORT'
  },
  serviceName: {
    doc: 'Api Service Name',
    format: String,
    default: 'grants-ui-config-api'
  },
  serviceVersion: /** @satisfies {SchemaObj<string | null>} */ ({
    doc: 'The service version, this variable is injected into your docker container in CDP environments',
    format: String,
    nullable: true,
    default: null,
    env: 'SERVICE_VERSION'
  }),
  root: {
    doc: 'Project root',
    format: String,
    default: cwd()
  },
  isProduction: {
    doc: 'If this application running in the production environment',
    format: Boolean,
    default: isProduction
  },
  isDevelopment: {
    doc: 'If this application running in the development environment',
    format: Boolean,
    default: isDev
  },
  isTest: {
    doc: 'If this application running in the test environment',
    format: Boolean,
    default: isTest
  },
  log: {
    enabled: {
      doc: 'Is logging enabled',
      format: Boolean,
      default: !isTest,
      env: 'LOG_ENABLED'
    },
    level: /** @type {SchemaObj<LevelWithSilent>} */ ({
      doc: 'Logging level',
      format: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
      default: 'info',
      env: 'LOG_LEVEL'
    }),
    format: /** @type {SchemaObj<'ecs' | 'pino-pretty'>} */ ({
      doc: 'Format to output logs in.',
      format: ['ecs', 'pino-pretty'],
      default: isProduction ? 'ecs' : 'pino-pretty',
      env: 'LOG_FORMAT'
    }),
    redact: {
      doc: 'Log paths to redact',
      format: Array,
      default: isProduction
        ? ['req.headers.authorization', 'req.headers.cookie', 'res.headers']
        : ['req', 'res', 'responseTime']
    }
  },
  mongo: {
    uri: {
      doc: 'URI for mongodb',
      format: String,
      default: 'mongodb://127.0.0.1:27017/',
      env: 'MONGO_URI'
    },
    databaseName: {
      doc: 'Database name for mongodb',
      format: String,
      default: 'grants-ui-config-api',
      env: 'MONGO_DATABASE'
    }
  },
  httpProxy: {
    doc: 'HTTP Proxy',
    format: String,
    nullable: true,
    default: null,
    env: 'HTTP_PROXY'
  },
  httpsProxy: {
    doc: 'HTTPS Proxy',
    format: String,
    default: '',
    env: 'CDP_HTTPS_PROXY'
  },
  isSecureContextEnabled: {
    doc: 'Enable Secure Context',
    format: Boolean,
    default: isProduction,
    env: 'ENABLE_SECURE_CONTEXT'
  },
  isMetricsEnabled: {
    doc: 'Enable metrics reporting',
    format: Boolean,
    default: isProduction,
    env: 'ENABLE_METRICS'
  },
  jwtSecret: {
    doc: 'Secret key for JWT service-to-service authentication',
    format: String,
    default: '',
    env: 'JWT_SECRET',
    sensitive: true
  },
  tracing: {
    header: {
      doc: 'CDP tracing header name',
      format: String,
      default: 'x-cdp-request-id',
      env: 'TRACING_HEADER'
    }
  },
  awsRegion: {
    doc: 'AWS region',
    format: String,
    default: 'eu-west-2',
    env: 'AWS_REGION'
  },
  snsEndpoint: {
    doc: 'The SNS endpoint (e.g. for LocalStack). Only used when audit SNS is enabled.',
    format: String,
    default: '',
    env: 'SNS_ENDPOINT'
  },
  snsTopicArn: {
    doc: 'SNS topic ARN for publishing audit events. Only used when audit SNS is enabled.',
    format: String,
    default: '',
    env: 'SNS_TOPIC_ARN'
  },
  publishAuditEvents: {
    doc: 'Enable publishing form audit events to SNS. Disabled by default.',
    format: Boolean,
    default: false,
    env: 'FEATURE_FLAG_PUBLISH_AUDIT_EVENTS'
  },
  s3Endpoint: {
    doc: 'The S3 HTTP(S) endpoint, if required (e.g. a local development dev service). Activating this will force path style addressing for compatibility with Localstack.',
    format: String,
    default: '',
    env: 'S3_ENDPOINT'
  },
  s3Bucket: {
    doc: 'S3 bucket name',
    format: String,
    default: '',
    env: 'FORM_DEF_BUCKET_NAME'
  },
  entitlementUrl: {
    doc: 'Forms entitlements API URL',
    format: String,
    default: 'http://localhost:3004',
    env: 'ENTITLEMENT_URL'
  },
  useEntitlementApi: {
    doc: 'Feature flag to enable entitlement API for fetching scopes',
    format: Boolean,
    default: false,
    env: 'FEATURE_FLAG_USE_ENTITLEMENT_API'
  }
})

config.validate({ allowed: 'strict' })

if (!config.get('jwtSecret')) {
  throw new Error('JWT_SECRET environment variable must be set.')
}
/**
 * @import { SchemaObj } from 'convict'
 * @import { LevelWithSilent } from 'pino'
 */
