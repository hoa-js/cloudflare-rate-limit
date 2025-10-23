import { jest } from '@jest/globals'

/**
 * Tests for RateLimiter (Cloudflare native Rate Limiting API)
 */

function createMockBinding (result) {
  return {
    async limit ({ key }) {
      return { success: result }
    }
  }
}

describe('RateLimiter header semantics', () => {
  test('error handler sets 429 on rate limit exceeded', async () => {
    jest.resetModules()
    const { RateLimiter } = await import('../src/RateLimiter.js')
    const binding = () => createMockBinding(false)
    const ctx = {
      req: {},
      res: { set: () => {} },
      thrown: null,
      throw: (status, message) => { ctx.thrown = { status, message } }
    }
    const next = jest.fn(async () => {})
    const mw = RateLimiter({
      binding,
      keyGenerator: () => 'ip'
    })
    await mw(ctx, next)
    expect(ctx.thrown?.status).toBe(429)
    expect(next).toHaveBeenCalledTimes(0)
  })

  test('success handler runs after next when allowed', async () => {
    jest.resetModules()
    const { RateLimiter } = await import('../src/RateLimiter.js')
    const binding = () => createMockBinding(true)
    let successRan = false
    const ctx = { req: {}, res: { set: () => {} }, throw: () => {} }
    const next = jest.fn(async () => {})
    const mw = RateLimiter({
      binding,
      keyGenerator: () => 'ip',
      successHandler: (c) => { successRan = true }
    })
    await mw(ctx, next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(successRan).toBe(true)
  })

  test('success handler still runs when next throws', async () => {
    jest.resetModules()
    const { RateLimiter } = await import('../src/RateLimiter.js')
    const binding = () => createMockBinding(true)
    let successRan = false
    const ctx = { req: {}, res: { set: () => {} }, throw: () => {} }
    const next = jest.fn(async () => { throw new Error('boom') })
    const mw = RateLimiter({
      binding,
      keyGenerator: () => 'ip',
      successHandler: () => { successRan = true }
    })
    await expect(mw(ctx, next)).rejects.toThrow('boom')
    expect(successRan).toBe(true)
  })

  test('uses default success handler (no-op) on success path', async () => {
    jest.resetModules()
    const { RateLimiter } = await import('../src/RateLimiter.js')
    const binding = () => createMockBinding(true)
    const ctx = { req: {}, res: { set: () => {} }, throw: () => {} }
    const next = jest.fn(async () => {})
    const mw = RateLimiter({ binding, keyGenerator: () => 'ip' })
    await mw(ctx, next)
    expect(next).toHaveBeenCalledTimes(1)
  })
})

describe('RateLimiter runtime branches', () => {
  test('skips rate limit when key is falsy', async () => {
    jest.resetModules()
    const { RateLimiter } = await import('../src/RateLimiter.js')
    const binding = jest.fn(() => createMockBinding(true))
    const ctx = { req: {}, res: { set: () => {} }, throw: () => {} }
    const next = jest.fn(async () => {})
    const mw = RateLimiter({ binding, keyGenerator: () => null })
    await mw(ctx, next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(binding).not.toHaveBeenCalled()
  })

  test.each([
    ['binding', { binding: /** @type {any} */ (123), keyGenerator: () => 'ip' }, 'options.binding must be a string or a function'],
    ['keyGenerator', { binding: () => createMockBinding(true), keyGenerator: /** @type {any} */ ('ip') }, 'options.keyGenerator must be a function'],
    ['successHandler', { binding: () => createMockBinding(true), keyGenerator: () => 'ip', successHandler: /** @type {any} */ (123) }, 'options.successHandler must be a function'],
    ['errorHandler', { binding: () => createMockBinding(true), keyGenerator: () => 'ip', errorHandler: /** @type {any} */ ({}) }, 'options.errorHandler must be a function']
  ])('throws when %s is invalid', async (field, options, expectedError) => {
    const { RateLimiter } = await import('../src/RateLimiter.js')
    expect(() => RateLimiter(options)).toThrow(expectedError)
  })

  test('throws when binding returns invalid binding', async () => {
    const { RateLimiter } = await import('../src/RateLimiter.js')
    const options = { binding: () => null, keyGenerator: () => 'ip' }
    const mw = RateLimiter(options)
    const ctx = { req: {}, res: { set: () => {} }, throw: () => {} }
    const next = jest.fn(async () => {})
    await expect(mw(ctx, next)).rejects.toThrow('options.binding must be a Rate Limiter binding name or return a Cloudflare Rate Limiter binding exposing limit()')
  })
})

describe('RateLimiter options validation', () => {
  test('throws when options is null', async () => {
    const { RateLimiter } = await import('../src/RateLimiter.js')
    expect(() => RateLimiter(/** @type {any} */ (null))).toThrow()
  })

  test('throws when called without options', async () => {
    const { RateLimiter } = await import('../src/RateLimiter.js')
    expect(() => RateLimiter()).toThrow('options.binding must be a string or a function')
  })
})

describe('RateLimiter binding as string', () => {
  test('accepts binding as string and gets from ctx.env', async () => {
    const { RateLimiter } = await import('../src/RateLimiter.js')
    const mockBinding = createMockBinding(true)
    const ctx = {
      env: { MY_RATE_LIMITER: mockBinding },
      req: {},
      res: { set: () => {} },
      throw: () => {}
    }
    const next = jest.fn(async () => {})
    const mw = RateLimiter({
      binding: 'MY_RATE_LIMITER',
      keyGenerator: () => 'user123'
    })
    await mw(ctx, next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('throws when string binding not found in ctx.env', async () => {
    const { RateLimiter } = await import('../src/RateLimiter.js')
    const ctx = {
      env: {},
      req: {},
      res: { set: () => {} },
      throw: () => {}
    }
    const next = jest.fn(async () => {})
    const mw = RateLimiter({
      binding: 'NONEXISTENT_LIMITER',
      keyGenerator: () => 'user123'
    })
    await expect(mw(ctx, next)).rejects.toThrow('options.binding must be a Rate Limiter binding name or return a Cloudflare Rate Limiter binding exposing limit()')
  })

  test('handles rate limit exceeded with string binding', async () => {
    const { RateLimiter } = await import('../src/RateLimiter.js')
    const mockBinding = createMockBinding(false)
    const ctx = {
      env: { RATE_LIMITER: mockBinding },
      req: {},
      res: { set: () => {} },
      thrown: null,
      throw: (status, message) => { ctx.thrown = { status, message } }
    }
    const next = jest.fn(async () => {})
    const mw = RateLimiter({
      binding: 'RATE_LIMITER',
      keyGenerator: () => 'user123'
    })
    await mw(ctx, next)
    expect(next).not.toHaveBeenCalled()
    expect(ctx.thrown?.status).toBe(429)
    expect(ctx.thrown?.message).toBe('Too Many Requests')
  })
})
