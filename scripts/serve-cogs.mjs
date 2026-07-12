// Sirve los COGs golden commiteados (tests/fixtures/cogs/r2/) como si
// fueran el bucket R2 público: mismo layout de claves, CORS abierto y
// soporte de Range (geotiff.js lee los COGs por slices). Lo usan los
// goldens visuales de Playwright vía NUXT_PUBLIC_R2_BASE_URL.
//
//   node scripts/serve-cogs.mjs [puerto]   (default 8790)
import { createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { join, normalize } from 'node:path'
import process from 'node:process'

const PORT = Number(process.argv[2] ?? 8790)
const ROOT = join(process.cwd(), 'tests/fixtures/cogs/r2')

const server = createServer((req, res) => {
  const key = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '')
  if (key.includes('..')) {
    res.writeHead(400).end()
    return
  }
  if (key === '' || key === '.') {
    // health check del webServer de Playwright
    res.writeHead(200, { 'access-control-allow-origin': '*' }).end('ok')
    return
  }
  const path = join(ROOT, key)

  let size
  try {
    size = statSync(path).size
  }
  catch {
    res.writeHead(404, { 'access-control-allow-origin': '*' }).end('COG golden no encontrado')
    return
  }

  const headers = {
    'content-type': 'image/tiff',
    'accept-ranges': 'bytes',
    'access-control-allow-origin': '*',
    'access-control-expose-headers': 'content-range,content-length,etag,accept-ranges',
  }

  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '')
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : size - Number(range[2])
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
    if (start > end || start < 0) {
      res.writeHead(416, { ...headers, 'content-range': `bytes */${size}` }).end()
      return
    }
    res.writeHead(206, {
      ...headers,
      'content-range': `bytes ${start}-${end}/${size}`,
      'content-length': end - start + 1,
    })
    createReadStream(path, { start, end }).pipe(res)
    return
  }

  res.writeHead(200, { ...headers, 'content-length': size })
  createReadStream(path).pipe(res)
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`COGs golden en http://127.0.0.1:${PORT} (raíz ${ROOT})`)
})
