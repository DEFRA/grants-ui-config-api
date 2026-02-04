import Boom from '@hapi/boom'
import { pino } from 'pino'

import {
  buildDefinition,
  buildList
} from '~/src/api/forms/__stubs__/definition.js'
import * as formDefinition from '~/src/api/forms/repositories/form-definition-repository.js'
import * as formMetadata from '~/src/api/forms/repositories/form-metadata-repository.js'
import { formMetadataDocument } from '~/src/api/forms/service/__stubs__/service.js'
import { mockFormVersionDocument } from '~/src/api/forms/service/__stubs__/versioning.js'
import {
  addListToDraftFormDefinition,
  duplicateListGuard,
  removeListOnDraftFormDefinition,
  updateListOnDraftFormDefinition
} from '~/src/api/forms/service/lists.js'
import * as versioningService from '~/src/api/forms/service/versioning.js'
import { getAuthor } from '~/src/helpers/get-author.js'
import { saveToS3 } from '~/src/messaging/s3.js'
import { prepareDb } from '~/src/mongo.js'

jest.mock('~/src/helpers/get-author.js')
jest.mock('~/src/api/forms/repositories/form-definition-repository.js')
jest.mock('~/src/api/forms/repositories/form-metadata-repository.js')
jest.mock('~/src/api/forms/templates.js')
jest.mock('~/src/mongo.js')
jest.mock('~/src/api/forms/service/versioning.js')
jest.mock('~/src/messaging/s3.js')

jest.useFakeTimers().setSystemTime(new Date('2020-01-01'))
describe('lists', () => {
  const id = '661e4ca5039739ef2902b214'
  const defaultAuthor = getAuthor()

  /**
   * @type {any}
   */
  const mockSession = defaultAuthor

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
  const exampleListWithDuplicateTitleId = '736bc0e2-4405-4b21-b38a-53a1b1a39e3e'
  const exampleListWithDuplicateTitle = buildList({
    id: exampleListWithDuplicateTitleId,
    name: 'eDcbA',
    title: 'Original List Title'
  })
  const exampleListWithDuplicateName = buildList({
    id: '8ea9fcfd-edc2-4a80-b707-711600c773a7',
    name: 'AbcDe',
    title: 'New list title'
  })
  const formDefinitionWithList = buildDefinition({
    lists: [exampleList]
  })
  const formDefinitionWithDuplicateListTitle = buildDefinition({
    lists: [exampleList, exampleListWithDuplicateTitle]
  })
  const formDefinitionWithDuplicateListName = buildDefinition({
    lists: [exampleList, exampleListWithDuplicateName]
  })

  beforeAll(async () => {
    await prepareDb(pino())
  })

  beforeEach(() => {
    jest.mocked(formMetadata.get).mockResolvedValue(formMetadataDocument)
    jest
      .mocked(formMetadata.updateAudit)
      .mockResolvedValue(formMetadataDocument)
    jest
      .mocked(versioningService.createFormVersion)
      .mockResolvedValue(mockFormVersionDocument)
    jest
      .mocked(versioningService.getLatestFormVersion)
      .mockResolvedValue(mockFormVersionDocument)
  })

  describe('duplicateListGuard', () => {
    it('should fail with a Boom.conflict given duplicate list title', async () => {
      jest
        .mocked(formDefinition.get)
        .mockResolvedValueOnce(formDefinitionWithDuplicateListTitle)

      await expect(duplicateListGuard('abc', mockSession)).rejects.toThrow(
        Boom.conflict('Duplicate list name or title found.')
      )
    })

    it('should fail with a Boom.conflict given duplicate list name', async () => {
      jest
        .mocked(formDefinition.get)
        .mockResolvedValueOnce(formDefinitionWithDuplicateListName)

      await expect(duplicateListGuard('abc', mockSession)).rejects.toThrow(
        Boom.conflict('Duplicate list name or title found.')
      )
    })

    it('should pass given unique list', async () => {
      jest
        .mocked(formDefinition.get)
        .mockResolvedValueOnce(formDefinitionWithList)
      const receivedDefinition = await duplicateListGuard('abc', mockSession)
      expect(receivedDefinition).toEqual(formDefinitionWithList)
    })
  })

  describe('addListsToDraftFormDefinition', () => {
    it('should add a list to the form definition', async () => {
      const s3Meta = {
        fileId: '3HL4kqtJlcpXrof3W3Zz4YBdvdz2FJ9n',
        filename:
          '6883d8667a2a64da10af4312_list_47cfaf57-6cda-44aa-9268-f37c674823d2.json',
        s3Key:
          'audit-definitions/6883d8667a2a64da10af4312_list_47cfaf57-6cda-44aa-9268-f37c674823d2.json'
      }
      jest.mocked(saveToS3).mockResolvedValue(s3Meta)
      jest
        .mocked(formDefinition.get)
        .mockResolvedValueOnce(formDefinitionWithList)
      const expectedList = buildList()
      const addListsMock = jest
        .mocked(formDefinition.addList)
        .mockResolvedValueOnce(expectedList)

      const result = await addListToDraftFormDefinition(
        id,
        expectedList,
        defaultAuthor
      )
      const [expectedFormId, listToInsert] = addListsMock.mock.calls[0]
      expect(expectedFormId).toBe(id)
      expect(listToInsert).toEqual(expectedList)
      expect(result).toEqual(expectedList)
      expectMetadataUpdate()
    })
    it('should fail with a conflict if there is a duplicate list', async () => {
      jest
        .mocked(formDefinition.get)
        .mockResolvedValue(formDefinitionWithDuplicateListName)
      await expect(
        addListToDraftFormDefinition(id, buildList(), defaultAuthor)
      ).rejects.toThrow(Boom.conflict('Duplicate list name or title found.'))
    })
  })

  describe('updateListOnDraftFormDefinition', () => {
    it('should update a list on the form definition', async () => {
      const s3Meta = {
        fileId: '3HL4kqtJlcpXrof3W3Zz4YBdvdz2FJ9n',
        filename:
          '6883d8667a2a64da10af4312_list_47cfaf57-6cda-44aa-9268-f37c674823d2.json',
        s3Key:
          'audit-definitions/6883d8667a2a64da10af4312_list_47cfaf57-6cda-44aa-9268-f37c674823d2.json'
      }
      jest.mocked(saveToS3).mockResolvedValue(s3Meta)
      const listToUpdate = buildList()
      const listId = '47cfaf57-6cda-44aa-9268-f37c674823d2'
      jest
        .mocked(formDefinition.get)
        .mockResolvedValueOnce(formDefinitionWithList)
      const updateListMock = jest
        .mocked(formDefinition.updateList)
        .mockResolvedValueOnce(listToUpdate)

      const result = await updateListOnDraftFormDefinition(
        id,
        listId,
        listToUpdate,
        defaultAuthor
      )
      const [expectedFormId, expectedListId, expectedListToUpdate] =
        updateListMock.mock.calls[0]
      expect(expectedFormId).toBe(id)
      expect(expectedListId).toBe(listId)
      expect(expectedListToUpdate).toEqual(listToUpdate)
      expect(result).toEqual(listToUpdate)
      expectMetadataUpdate()
    })
    it('should throw a conflict if updated list name or title exists in other list', async () => {
      jest
        .mocked(formDefinition.get)
        .mockResolvedValueOnce(formDefinitionWithDuplicateListTitle)
      await expect(
        updateListOnDraftFormDefinition(
          id,
          exampleListWithDuplicateTitleId,
          exampleListWithDuplicateTitle,
          defaultAuthor
        )
      ).rejects.toThrow(Boom.conflict('Duplicate list name or title found.'))
    })
  })

  describe('removeListOnDraftFormDefinition', () => {
    const listId = '47cfaf57-6cda-44aa-9268-f37c674823d2'

    it('should remove a list on the form definition', async () => {
      await removeListOnDraftFormDefinition(id, listId, defaultAuthor)
      const [expectedFormId, expectedListId] = jest.mocked(
        formDefinition.deleteList
      ).mock.calls[0]
      expect(expectedFormId).toBe(id)
      expect(expectedListId).toBe(listId)
      expectMetadataUpdate()
    })
    it('should surface errors', async () => {
      const boomInternal = Boom.internal('Something went wrong')
      jest.mocked(formDefinition.deleteList).mockRejectedValueOnce(boomInternal)
      await expect(
        removeListOnDraftFormDefinition(id, listId, defaultAuthor)
      ).rejects.toThrow(boomInternal)
    })
  })
})
