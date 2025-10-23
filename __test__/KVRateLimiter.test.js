import { jest } from '@jest/globals'

// Minimal KV mock
function createMockKV () {
  return {
    async get () { return null },
    async put () {}
  }
}

describe('KVRateLimiter middleware validations', () => {
  test('throws when interval > period', async () => {
    const { KVRateLimiter } = await import('../src/KVRateLimiter.js')
    const binding = () => createMockKV()
    const options = {
      binding,
      prefix: 'ratelimit:',
      limit: 5,
      period: 60,
      interval: 61,
      keyGenerator: () => 'ip'
    }
    expect(() => KVRateLimiter(options)).toThrow('options.interval must be <= options.period')
  })

  test('returns middleware when interval === period', async () => {
    const { KVRateLimiter } = await import('../src/KVRateLimiter.js')
    const binding = () => createMockKV()
    const options = {
      binding,
      prefix: 'ratelimit:',
      limit: 5,
      period: 60,
      interval: 60,
      keyGenerator: () => 'ip'
    }
    const mw = KVRateLimiter(options)
    expect(typeof mw).toBe('function')
  })

  test('skips rate limiting when keyGenerator returns falsy', async () => {
    const { KVRateLimiter } = await import('../src/KVRateLimiter.js')
    const binding = () => createMockKV()
    const next = jest.fn(async () => {})
    const ctx = { req: {}, res: { set: () => {} }, throw: () => {} }
    const mw = KVRateLimiter({
      binding,
      prefix: 'ratelimit:',
      limit: 5,
      period: 60,
      interval: 0,
      keyGenerator: () => null
    })
    await mw(ctx, next)
    expect(next).toHaveBeenCalledTimes(1)
  })
})

describe('KVRateLimiter header semantics', () => {
  test('error handler sets X-RateLimit-Reset to now + reset', async () => {
    jest.resetModules()
    jest.unstable_mockModule('cloudflare-kv-rate-limit', () => ({
      default: () => async () => ({ success: false, remaining: 0, reset: 5 })
    }))
    const { KVRateLimiter } = await import('../src/KVRateLimiter.js')
    const binding = () => createMockKV()
    const ctx = {
      req: {},
      res: { set: () => {} },
      thrown: null,
      throw: (status, message, { headers }) => { ctx.thrown = { status, message, headers } }
    }
    const next = jest.fn(async () => {})
    const mw = KVRateLimiter({
      binding,
      prefix: 'ratelimit:',
      limit: 5,
      period: 60,
      interval: 0,
      keyGenerator: () => 'ip'
    })
    await mw(ctx, next)
    expect(ctx.thrown?.status).toBe(429)
    const resetHeader = Number(ctx.thrown.headers['X-RateLimit-Reset'])
    const nowEpoch = Math.ceil(Date.now() / 1000)
    expect(resetHeader).toBeGreaterThanOrEqual(nowEpoch + 5)
    expect(ctx.thrown.headers['Retry-After']).toBe('5')
  })

  test('success handler sets headers with now + reset and runs after next', async () => {
    jest.resetModules()
    jest.unstable_mockModule('cloudflare-kv-rate-limit', () => ({
      default: () => async () => ({ success: true, remaining: 4, reset: 10 })
    }))
    const { KVRateLimiter } = await import('../src/KVRateLimiter.js')
    const binding = () => createMockKV()
    let headersSet = null
    const ctx = {
      req: {},
      res: { set: (h) => { headersSet = h } },
      throw: () => {}
    }
    const next = jest.fn(async () => {})
    const mw = KVRateLimiter({
      binding,
      prefix: 'ratelimit:',
      limit: 5,
      period: 60,
      interval: 0,
      keyGenerator: () => 'ip'
    })
    await mw(ctx, next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(headersSet['X-RateLimit-Limit']).toBe('5')
    expect(headersSet['X-RateLimit-Remaining']).toBe('4')
    const resetHeader = Number(headersSet['X-RateLimit-Reset'])
    const nowEpoch = Math.ceil(Date.now() / 1000)
    expect(resetHeader).toBeGreaterThanOrEqual(nowEpoch + 10)
  })

  test('success handler still runs when next throws', async () => {
    jest.resetModules()
    jest.unstable_mockModule('cloudflare-kv-rate-limit', () => ({
      default: () => async () => ({ success: true, remaining: 3, reset: 2 })
    }))
    const { KVRateLimiter } = await import('../src/KVRateLimiter.js')
    const binding = () => createMockKV()
    let headersSet = null
    const ctx = {
      req: {},
      res: { set: (h) => { headersSet = h } },
      throw: () => {}
    }
    const next = async () => { throw new Error('boom') }
    const mw = KVRateLimiter({
      binding,
      prefix: 'ratelimit:',
      limit: 5,
      period: 60,
      interval: 0,
      keyGenerator: () => 'ip'
    })
    await expect(mw(ctx, next)).rejects.toThrow('boom')
    expect(headersSet).not.toBeNull()
    expect(headersSet['X-RateLimit-Limit']).toBe('5')
    expect(headersSet['X-RateLimit-Remaining']).toBe('3')
    const resetHeader = Number(headersSet['X-RateLimit-Reset'])
    const nowEpoch = Math.ceil(Date.now() / 1000)
    expect(resetHeader).toBeGreaterThanOrEqual(nowEpoch + 2)
  })
})

describe('KVRateLimiter invalid option branches', () => {
  const baseOptions = {
    binding: () => createMockKV(),
    prefix: 'ratelimit:',
    limit: 5,
    period: 60,
    interval: 0,
    keyGenerator: () => 'ip'
  }

  test.each([
    ['binding', { ...baseOptions, binding: null }, 'options.binding must be a string or a function'],
    ['prefix (empty)', { ...baseOptions, prefix: '' }, 'options.prefix must be a non-empty string'],
    ['prefix (null)', { ...baseOptions, prefix: /** @type {any} */ (null) }, 'options.prefix must be a non-empty string'],
    ['limit (< 1)', { ...baseOptions, limit: 0 }, 'options.limit must be >= 1'],
    ['limit (NaN)', { ...baseOptions, limit: Number.NaN }, 'options.limit must be >= 1'],
    ['period (< 60)', { ...baseOptions, period: 59 }, 'options.period must be >= 60 seconds (Cloudflare KV TTL minimum)'],
    ['period (NaN)', { ...baseOptions, period: Number.NaN }, 'options.period must be >= 60 seconds (Cloudflare KV TTL minimum)'],
    ['interval (< 0)', { ...baseOptions, interval: -1 }, 'options.interval must be >= 0'],
    ['interval (NaN)', { ...baseOptions, interval: Number.NaN }, 'options.interval must be >= 0'],
    ['keyGenerator', { ...baseOptions, keyGenerator: /** @type {any} */ ('ip') }, 'options.keyGenerator must be a function'],
    ['successHandler', { ...baseOptions, successHandler: /** @type {any} */ (123) }, 'options.successHandler must be a function'],
    ['errorHandler', { ...baseOptions, errorHandler: /** @type {any} */ ({}) }, 'options.errorHandler must be a function']
  ])('throws when %s is invalid', async (field, options, expectedError) => {
    const { KVRateLimiter } = await import('../src/KVRateLimiter.js')
    expect(() => KVRateLimiter(options)).toThrow(expectedError)
  })

  test.each([
    ['null store', () => null],
    ['lacks put', () => ({ get: async () => null })],
    ['lacks get', () => ({ put: async () => {} })]
  ])('throws when binding returns invalid KV: %s', async (desc, bindingFn) => {
    const { KVRateLimiter } = await import('../src/KVRateLimiter.js')
    const options = {
      binding: bindingFn,
      prefix: 'ratelimit:',
      limit: 5,
      period: 60,
      interval: 0,
      keyGenerator: () => 'ip'
    }
    const mw = KVRateLimiter(options)
    const ctx = { req: {}, res: { set: () => {} }, throw: () => {} }
    const next = jest.fn(async () => {})
    await expect(mw(ctx, next)).rejects.toThrow('options.binding must be a KV namespace name or return a Cloudflare KV namespace exposing get() and put()')
  })
})

describe('KVRateLimiter options validation', () => {
  test('throws when options is null', async () => {
    const { KVRateLimiter } = await import('../src/KVRateLimiter.js')
    expect(() => KVRateLimiter(/** @type {any} */ (null))).toThrow()
  })

  test('throws when called without options', async () => {
    jest.resetModules()
    const { KVRateLimiter } = await import('../src/KVRateLimiter.js')
    expect(() => KVRateLimiter()).toThrow('options.binding must be a string or a function')
  })
})

describe('KVRateLimiter default options branches', () => {
  test('uses default prefix and interval when omitted', async () => {
    jest.resetModules()
    let capturedOpts = null
    jest.unstable_mockModule('cloudflare-kv-rate-limit', () => ({
      default: (opts) => { capturedOpts = opts; return async () => ({ success: true, remaining: 4, reset: 1 }) }
    }))
    const { KVRateLimiter } = await import('../src/KVRateLimiter.js')
    const binding = () => createMockKV()
    const mw = KVRateLimiter({
      binding,
      // prefix omitted
      limit: 5,
      period: 60,
      // interval omitted
      keyGenerator: () => 'ip'
    })
    const ctx = { req: {}, res: { set: () => {} }, throw: () => {} }
    const next = jest.fn(async () => {})
    await mw(ctx, next)
    expect(capturedOpts.prefix).toBe('ratelimit:')
    expect(capturedOpts.interval).toBe(0)
  })
})

describe('KVRateLimiter binding as string', () => {
  test('accepts binding as string and gets from ctx.env', async () => {
    jest.resetModules()
    jest.unstable_mockModule('cloudflare-kv-rate-limit', () => ({
      default: () => async () => ({ success: true, remaining: 4, reset: 10 })
    }))
    const { KVRateLimiter } = await import('../src/KVRateLimiter.js')
    const mockKV = createMockKV()
    const ctx = {
      env: { MY_KV: mockKV },
      req: {},
      res: { set: () => {} },
      throw: () => {}
    }
    const next = jest.fn(async () => {})
    const mw = KVRateLimiter({
      binding: 'MY_KV',
      prefix: 'test:',
      limit: 5,
      period: 60,
      keyGenerator: () => 'user123'
    })
    await mw(ctx, next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('throws when string binding not found in ctx.env', async () => {
    jest.resetModules()
    const { KVRateLimiter } = await import('../src/KVRateLimiter.js')
    const ctx = {
      env: {},
      req: {},
      res: { set: () => {} },
      throw: () => {}
    }
    const next = jest.fn(async () => {})
    const mw = KVRateLimiter({
      binding: 'NONEXISTENT_KV',
      prefix: 'test:',
      limit: 5,
      period: 60,
      keyGenerator: () => 'user123'
    })
    await expect(mw(ctx, next)).rejects.toThrow('options.binding must be a KV namespace name or return a Cloudflare KV namespace exposing get() and put()')
  })
})
