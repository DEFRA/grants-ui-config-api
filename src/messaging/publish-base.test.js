import { PublishCommand, SNSClient } from '@aws-sdk/client-sns'
import { buildFormCreatedMessage } from '@defra/forms-model/stubs'
import { mockClient } from 'aws-sdk-client-mock'

import { config } from '~/src/config/index.js'
import 'aws-sdk-client-mock-jest'
import { publishEvent } from '~/src/messaging/publish-base.js'

jest.mock('~/src/config/index.js', () => {
  const testConfig = {
    awsRegion: 'eu-west-2',
    snsEndpoint: 'http://localhost',
    snsTopicArn: 'arn:aws:sns:eu-west-2:000000000000:grants_ui_config_api_events',
    publishAuditEvents: true
  }
  return {
    config: {
      get: jest.fn().mockImplementation((envName) => {
        // @ts-expect-error - untyped stub return value
        return testConfig[envName]
      })
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

    it('should not publish if publish audit events feature flag is disabled', async () => {
      jest.mocked(config.get).mockReturnValue(false)
      const val = await publishEvent(message)
      expect(val).toBeUndefined()
      expect(snsMock).not.toHaveReceivedCommand(PublishCommand)
    })

    it('should publish', async () => {
      jest.mocked(config.get).mockReturnValue(true)
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
