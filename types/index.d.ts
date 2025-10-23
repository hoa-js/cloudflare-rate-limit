import type { HoaContext, HoaMiddleware } from 'hoa'

export interface KVRateLimiterOptions {
  binding: string | ((ctx: HoaContext) => any)
  prefix?: string
  limit: number
  period: number
  interval?: number
  keyGenerator: (ctx: HoaContext) => string | null | undefined | false
  successHandler?: (ctx: HoaContext, limit: number, remaining: number, reset: number) => void
  errorHandler?: (ctx: HoaContext, limit: number, remaining: number, reset: number) => void
}

export interface RateLimiterOptions {
  binding: string | ((ctx: HoaContext) => any)
  keyGenerator: (ctx: HoaContext) => string | null | undefined | false
  successHandler?: (ctx: HoaContext) => void
  errorHandler?: (ctx: HoaContext) => void
}

export function KVRateLimiter (
  options: KVRateLimiterOptions
): HoaMiddleware

export function RateLimiter (
  options: RateLimiterOptions
): HoaMiddleware
