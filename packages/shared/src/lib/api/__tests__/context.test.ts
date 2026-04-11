const createRequestContainer = jest.fn()
const getAuthFromRequest = jest.fn()
const resolveTranslations = jest.fn()

jest.mock('../../di/container', () => ({
  createRequestContainer: (...args: unknown[]) => createRequestContainer(...args),
}))

jest.mock('../../auth/server', () => ({
  getAuthFromRequest: (...args: unknown[]) => getAuthFromRequest(...args),
}))

jest.mock('../../i18n/server', () => ({
  resolveTranslations: (...args: unknown[]) => resolveTranslations(...args),
}))

describe('resolveRequestContext', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns the request container, auth context, and translate helper', async () => {
    const container = {
      resolve: jest.fn(),
    }
    const auth = {
      sub: 'user-1',
      tenantId: 'tenant-1',
      orgId: 'org-1',
      roles: ['admin'],
    }
    const translate = jest.fn((key: string, fallback?: string) => fallback ?? key)
    const request = new Request('https://example.test/api/messages')

    createRequestContainer.mockResolvedValue(container)
    getAuthFromRequest.mockResolvedValue(auth)
    resolveTranslations.mockResolvedValue({ translate })

    const { resolveRequestContext } = await import('../context')

    await expect(resolveRequestContext(request)).resolves.toEqual({
      ctx: {
        container,
        auth,
        translate,
      },
    })

    expect(createRequestContainer).toHaveBeenCalledTimes(1)
    expect(getAuthFromRequest).toHaveBeenCalledWith(request)
    expect(resolveTranslations).toHaveBeenCalledTimes(1)
  })

  it('preserves anonymous auth when no authenticated context is present', async () => {
    const translate = jest.fn((key: string, fallback?: string) => fallback ?? key)

    createRequestContainer.mockResolvedValue({ resolve: jest.fn() })
    getAuthFromRequest.mockResolvedValue(null)
    resolveTranslations.mockResolvedValue({ translate })

    const { resolveRequestContext } = await import('../context')

    await expect(resolveRequestContext(new Request('https://example.test/api/messages'))).resolves.toMatchObject({
      ctx: {
        auth: null,
        translate,
      },
    })
  })
})
