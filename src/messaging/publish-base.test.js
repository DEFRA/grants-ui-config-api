import { PublishCommand, SNSClient } from '@aws-sdk/client-sns'
import { buildFormCreatedMessage } from '@defra/forms-model/stubs'
import { mockClient } from 'aws-sdk-client-mock'

import { config } from '~/src/config/index.js'
import 'aws-sdk-client-mock-jest'
import { publishEvent } from '~/src/messaging/publish-base.js'

jest.mock('~/src/config/index.js', () => {
  /** @type {Record<string, string | boolean>} */
  const testConfig = {
    awsRegion: 'eu-west-2',
    snsEndpoint: 'http://localhost',
    snsTopicArn: 'arn:aws:sns:eu-west-2:000000000000:grants_ui_config_api_events',
    publishAuditEvents: false
  }
  return {
    config: {
      get: jest.fn((key) => testConfig[/** @type {string} */ (key)])
    }
  }
})

jest.mock('~/src/api/forms/service/shared.js', () => ({
  logger: {
    info: jest.fn()
  }
}))

describe('publish-base', () => {
  const snsMock = mockClient(SNSClient)

  afterEach(() => {
    snsMock.reset()
  })

  describe('publishEvent', () => {
    const message = buildFormCreatedMessage()

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('does not publish when publishAuditEvents is false', async () => {
      jest
        .mocked(config.get)
        .mockImplementation((key) =>
          key === 'publishAuditEvents' ? false : 'arn:aws:sns:eu-west-2:000000000000:topic'
        )
      const val = await publishEvent(message)
      expect(val).toBeUndefined()
      expect(snsMock).not.toHaveReceivedCommand(PublishCommand)
    })

    it('publishes when publishAuditEvents is true', async () => {
      /** @type {Record<string, string | boolean>} */
      const m = {
        publishAuditEvents: true,
        snsTopicArn: 'arn:aws:sns:eu-west-2:000000000000:grants_ui_config_api_events',
        awsRegion: 'eu-west-2',
        snsEndpoint: 'http://localhost'
      }
      jest.mocked(config.get).mockImplementation((key) => m[/** @type {string} */ (key)])
      snsMock.on(PublishCommand).resolves({
        MessageId: '00000000-0000-0000-0000-000000000000'
      })

      await publishEvent(message)
      expect(snsMock).toHaveReceivedCommandWith(PublishCommand, {
        TopicArn: 'arn:aws:sns:eu-west-2:000000000000:grants_ui_config_api_events',
        Message: JSON.stringify(message)
      })
    })
  })
})
