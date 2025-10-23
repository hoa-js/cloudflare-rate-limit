import CloudflareKVRateLimiter from 'cloudflare-kv-rate-limit'
import { assert, getBinding } from './utils.js'

/**
 * @typedef {Object} KVRateLimiterOptions
 * @property {string | ((ctx: HoaContext) => KV)} binding - KV namespace name (string) or factory function returning KV for the current ctx
 * @property {string} [prefix="ratelimit:"] - KV key prefix
 * @property {number} limit - Max requests per period
 * @property {number} period - Period length in seconds
 * @property {number} [interval=0] - Optional sub-interval seconds (used for header reset rounding)
 * @property {(ctx: HoaContext) => (string | null | undefined | false)} keyGenerator - Return falsy to skip rate limiting
 * @property {(ctx: HoaContext, limit: number, remaining: number, reset: number) => void} [successHandler]
 * @property {(ctx: HoaContext, limit: number, remaining: number, reset: number) => void} [errorHandler]
 */

/**
 * Cloudflare KV Rate Limiter for Hoa.
 *
 * @param {KVRateLimiterOptions} options
 * @returns {HoaMiddleware} Hoa middleware
 */
export function KVRateLimiter (options = {}) {
  let {
    binding,
    prefix = 'ratelimit:',
    limit,
    period,
    interval = 0,
    keyGenerator,
    successHandler = defaultSuccessHandler,
    errorHandler = defaultErrorHandler
  } = options

  limit = parseInt(limit)
  period = parseInt(period)
  interval = parseInt(interval)

  assert(typeof binding === 'string' || typeof binding === 'function', 'options.binding must be a string or a function')
  assert(typeof prefix === 'string' && prefix.length > 0, 'options.prefix must be a non-empty string')
  assert(Number.isFinite(limit) && limit >= 1, 'options.limit must be >= 1')
  assert(Number.isFinite(period) && period >= 60, 'options.period must be >= 60 seconds (Cloudflare KV TTL minimum)')
  assert(Number.isFinite(interval) && interval >= 0, 'options.interval must be >= 0')
  assert(interval <= period, 'options.interval must be <= options.period')
  assert(typeof keyGenerator === 'function', 'options.keyGenerator must be a function')
  assert(typeof successHandler === 'function', 'options.successHandler must be a function')
  assert(typeof errorHandler === 'function', 'options.errorHandler must be a function')

  return async function kvRateLimiter (ctx, next) {
    const key = keyGenerator(ctx)

    // Skip rate limit when key is falsy
    if (!key) {
      await next()
      return
    }

    const kvBinding = getBinding(ctx, binding)
    assert(kvBinding && typeof kvBinding.get === 'function' && typeof kvBinding.put === 'function', 'options.binding must be a KV namespace name or return a Cloudflare KV namespace exposing get() and put()')

    const ratelimiter = CloudflareKVRateLimiter({ store: kvBinding, prefix, limit, period, interval })

    const { success, remaining, reset } = await ratelimiter(key)

    if (!success) {
      await errorHandler(ctx, limit, remaining, reset)
      return
    }

    try {
      await next()
    } finally {
      await successHandler(ctx, limit, remaining, reset)
    }
  }
}

function defaultSuccessHandler (ctx, limit, remaining, reset) {
  ctx.res.set({
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(Math.ceil(Date.now() / 1000 + reset))
  })
}

function defaultErrorHandler (ctx, limit, remaining, reset) {
  ctx.throw(429, 'Too Many Requests', {
    headers: {
      'X-RateLimit-Limit': String(limit),
      'X-RateLimit-Remaining': String(remaining),
      'X-RateLimit-Reset': String(Math.ceil(Date.now() / 1000 + reset)),
      'Retry-After': String(reset)
    }
  })
}

export default KVRateLimiter
