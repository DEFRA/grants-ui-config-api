import { getAllGrants, getGrantVersion } from '~/src/api/forms/service/config-broker-client.js'

jest.mock('~/src/helpers/logging/logger.js', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn()
  }))
}))

const BASE_URL = 'http://config-broker.test'

/** @type {jest.MockedFunction<typeof fetch>} */
const mockFetch = jest.fn()
global.fetch = mockFetch

/** @param {object} body */
function mockJsonResponse(body, status = 200) {
  return /** @type {any} */ ({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body)
  })
}

describe('config-broker-client', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  describe('getAllGrants', () => {
    const grantsResponse = [
      {
        grant: 'example-grant',
        versions: [{ version: '1.0.0', status: 'active', lastUpdated: '2026-01-01T00:00:00.000Z' }]
      }
    ]

    it('fetches from /api/allGrants and returns parsed JSON', async () => {
      mockFetch.mockResolvedValue(mockJsonResponse(grantsResponse))

      const result = await getAllGrants(BASE_URL)

      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE_URL}/api/allGrants`,
        expect.objectContaining({ headers: expect.any(Object) })
      )
      expect(result).toEqual(grantsResponse)
    })

    it('throws when the response is not ok', async () => {
      mockFetch.mockResolvedValue(mockJsonResponse({}, 500))

      await expect(getAllGrants(BASE_URL)).rejects.toThrow(
        `Config broker GET ${BASE_URL}/api/allGrants failed with status 500`
      )
    })
  })

  describe('getGrantVersion', () => {
    const versionDetail = {
      grant: 'example-grant',
      version: '1.0.0',
      status: 'active',
      path: 'my-bucket',
      manifest: ['example-grant/1.0.0/example-grant.yaml'],
      lastUpdated: '2026-01-01T00:00:00.000Z'
    }

    it('fetches from /api/version with correct query params', async () => {
      mockFetch.mockResolvedValue(mockJsonResponse(versionDetail))

      const result = await getGrantVersion(BASE_URL, 'example-grant', '1.0.0')

      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE_URL}/api/version?grant=example-grant&version=1.0.0`,
        expect.objectContaining({ headers: expect.any(Object) })
      )
      expect(result).toEqual(versionDetail)
    })

    it('URL-encodes the grant slug', async () => {
      mockFetch.mockResolvedValue(mockJsonResponse(versionDetail))

      await getGrantVersion(BASE_URL, 'my grant', '1.0.0')

      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE_URL}/api/version?grant=my%20grant&version=1.0.0`,
        expect.objectContaining({ headers: expect.any(Object) })
      )
    })

    it('throws when the response is not ok', async () => {
      mockFetch.mockResolvedValue(mockJsonResponse({}, 404))

      await expect(getGrantVersion(BASE_URL, 'example-grant', '9.9.9')).rejects.toThrow('failed with status 404')
    })
  })
})
