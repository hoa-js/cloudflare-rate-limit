## @hoajs/cloudflare-rate-limit

Cloudflare Rate Limit middleware for Hoa.

## Installation

```bash
$ npm i @hoajs/cloudflare-rate-limit --save
```

## Quick Start

### RateLimiter (using Cloudflare native Rate Limiting API)

```js
import { Hoa } from 'hoa'
import { RateLimiter } from '@hoajs/cloudflare-rate-limit'

const app = new Hoa()

app.use(RateLimiter({
  binding: 'RATE_LIMITER',
  keyGenerator: (ctx) => ctx.req.ip
}))

app.use(async (ctx) => {
  ctx.res.body = 'Hello, Hoa!'
})

export default app
```

### KVRateLimiter (using Cloudflare KV)

```js
import { Hoa } from 'hoa'
import { KVRateLimiter } from '@hoajs/cloudflare-rate-limit'

const app = new Hoa()

app.use(KVRateLimiter({
  binding: 'KV',
  prefix: 'ratelimit:',
  limit: 3,
  period: 60,
  interval: 10,
  keyGenerator: (ctx) => ctx.req.ip
}))

app.use(async (ctx) => {
  ctx.res.body = 'Hello, Hoa!'
})

export default app
```

## Documentation

The documentation is available on [hoa-js.com](https://hoa-js.com/middleware/ratelimit/cloudflare-rate-limit.html)

## Test (100% coverage)

```sh
$ npm test
```

## License

MIT
