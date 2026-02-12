import { AuditEventMessageType, FormDefinitionRequestType } from '@defra/forms-model'
import { pino } from 'pino'

import { buildDefinition, buildList } from '~/src/api/forms/__stubs__/definition.js'
import * as formDefinition from '~/src/api/forms/repositories/form-definition-repository.js'
import * as formMetadata from '~/src/api/forms/repositories/form-metadata-repository.js'
import { formMetadataDocument } from '~/src/api/forms/service/__stubs__/service.js'
import { mockFormVersionDocument } from '~/src/api/forms/service/__stubs__/versioning.js'
import { updateOptionOnDraftDefinition } from '~/src/api/forms/service/options.js'
import * as versioningService from '~/src/api/forms/service/versioning.js'
import { getAuthor } from '~/src/helpers/get-author.js'
import * as publishBase from '~/src/messaging/publish-base.js'
import { prepareDb } from '~/src/mongo.js'

jest.mock('~/src/helpers/get-author.js')
jest.mock('~/src/api/forms/repositories/form-definition-repository.js')
jest.mock('~/src/api/forms/repositories/form-metadata-repository.js')
jest.mock('~/src/api/forms/templates.js')
jest.mock('~/src/mongo.js')
jest.mock('~/src/api/forms/service/versioning.js')
jest.mock('~/src/messaging/publish-base.js')
jest.mock('~/src/messaging/s3.js')

jest.useFakeTimers().setSystemTime(new Date('2020-01-01'))
describe('options', () => {
  const id = '661e4ca5039739ef2902b214'
  const defaultAuthor = getAuthor()

  const dbMetadataSpy = jest.spyOn(formMetadata, 'updateAudit')

  const expectMetadataUpdate = () => {
    expect(dbMetadataSpy).toHaveBeenCalled()
    const [formId, author] = dbMetadataSpy.mock.calls[0]
    expect(formId).toBe(id)
    expect(author).toEqual(defaultAuthor)
  }

  const exampleList = buildList({
    id: '5fa9c135-5397-4372-b168-f75e21fc19e4',
    name: 'AbcDe',
    title: 'Original List Title'
  })
  const formDefinitionWithList = buildDefinition({
    lists: [exampleList]
  })

  beforeAll(async () => {
    await prepareDb(pino())
  })

  beforeEach(() => {
    jest.mocked(formMetadata.get).mockResolvedValue(formMetadataDocument)
    jest.mocked(formMetadata.updateAudit).mockResolvedValue(formMetadataDocument)
    jest.mocked(versioningService.createFormVersion).mockResolvedValue(mockFormVersionDocument)
    jest.mocked(versioningService.getLatestFormVersion).mockResolvedValue(mockFormVersionDocument)
  })

  describe('updateOptionOnDraftDefinition', () => {
    it('should add a list to the form definition', async () => {
      jest.mocked(formDefinition.get).mockResolvedValueOnce(formDefinitionWithList)
      const updateOptionMock = jest.mocked(formDefinition.updateOption).mockResolvedValueOnce(formDefinitionWithList)
      const publishEventSpy = jest.spyOn(publishBase, 'publishEvent')

      const result = await updateOptionOnDraftDefinition(id, 'showReferenceNumber', 'true', defaultAuthor)
      const [expectedFormId, optionName] = updateOptionMock.mock.calls[0]
      expect(expectedFormId).toBe(id)
      expect(optionName).toBe('showReferenceNumber')
      expect(result).toEqual({ option: { showReferenceNumber: 'true' } })
      expectMetadataUpdate()

      const [auditMessage] = publishEventSpy.mock.calls[0]
      expect(auditMessage).toMatchObject({
        type: AuditEventMessageType.FORM_UPDATED
      })
      expect(auditMessage.data).toMatchObject({
        requestType: FormDefinitionRequestType.UPDATE_OPTION,
        payload: { option: { showReferenceNumber: 'true' } }
      })
    })
  })
})
