import { assert, getBinding } from './utils.js'

/**
 * @typedef {Object} RateLimiterOptions
 * @property {string | ((ctx: HoaContext) => RateLimiterBinding)} binding - Rate Limiter binding name (string) or factory function returning binding for the current ctx
 * @property {(ctx: HoaContext) => (string | null | undefined | false)} keyGenerator - Return falsy to skip rate limiting
 * @property {(ctx: HoaContext) => void} [successHandler]
 * @property {(ctx: HoaContext) => void} [errorHandler]
 */

/**
 * Cloudflare Rate Limiter for Hoa (using native Cloudflare Rate Limiting API).
 * Note: limit and period are configured in wrangler.toml, not in code.
 *
 * @param {RateLimiterOptions} options
 * @returns {HoaMiddleware} Hoa middleware
 */
export function RateLimiter (options = {}) {
  const {
    binding,
    keyGenerator,
    successHandler = defaultSuccessHandler,
    errorHandler = defaultErrorHandler
  } = options

  assert(typeof binding === 'string' || typeof binding === 'function', 'options.binding must be a string or a function')
  assert(typeof keyGenerator === 'function', 'options.keyGenerator must be a function')
  assert(typeof successHandler === 'function', 'options.successHandler must be a function')
  assert(typeof errorHandler === 'function', 'options.errorHandler must be a function')

  return async function rateLimiter (ctx, next) {
    const key = keyGenerator(ctx)

    // Skip rate limit when key is falsy
    if (!key) {
      await next()
      return
    }

    const rateLimiterBinding = getBinding(ctx, binding)
    assert(rateLimiterBinding && typeof rateLimiterBinding.limit === 'function', 'options.binding must be a Rate Limiter binding name or return a Cloudflare Rate Limiter binding exposing limit()')

    // Use Cloudflare's native Rate Limiting API
    const { success } = await rateLimiterBinding.limit({ key })

    if (!success) {
      // Rate limit exceeded
      await errorHandler(ctx)
      return
    }

    try {
      await next()
    } finally {
      await successHandler(ctx)
    }
  }
}

function defaultSuccessHandler (ctx) {
  // No-op by default
  // Users can provide custom handler to set headers if needed
}

function defaultErrorHandler (ctx) {
  ctx.throw(429, 'Too Many Requests')
}

export default RateLimiter
