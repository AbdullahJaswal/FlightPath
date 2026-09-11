// Production server: static assets, the Start fetch handler and the live WebSocket proxy.
import { createReadStream } from "node:fs"
import { readFile, stat } from "node:fs/promises"
import { createServer, request as httpRequest } from "node:http"
import { extname, join, normalize } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { createGzip, gzip } from "node:zlib"
import app from "./dist/server/server.js"

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? "0.0.0.0"
const apiUrl = new URL(process.env.API_URL ?? "http://localhost:8080/api/v1")
const clientDir = fileURLToPath(new URL("./dist/client/", import.meta.url))
const gzipAsync = promisify(gzip)

const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
}
const compressible = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".mjs",
  ".svg",
  ".txt",
  ".webmanifest",
])

// hashed assets are immutable, keep them gzipped in memory
const assets = new Map()

const server = createServer(async (req, res) => {
  try {
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`
    )
    if (url.pathname === "/healthz") {
      res.writeHead(200, { "content-type": "text/plain" })
      res.end("ok")
      return
    }
    if (
      (req.method === "GET" || req.method === "HEAD") &&
      (await serveStatic(req, res, url.pathname))
    ) {
      return
    }
    await render(req, res, url)
  } catch (err) {
    console.error(err)
    if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" })
    res.end("internal error")
  }
})

async function serveStatic(req, res, pathname) {
  if (pathname === "/" || pathname.includes("\0")) return false
  const file = join(clientDir, normalize(decodeURIComponent(pathname)))
  if (!file.startsWith(clientDir)) return false
  let info
  try {
    info = await stat(file)
  } catch {
    return false
  }
  if (!info.isFile()) return false

  const ext = extname(file).toLowerCase()
  const immutable = pathname.startsWith("/assets/")
  const gzipped =
    compressible.has(ext) &&
    /\bgzip\b/.test(req.headers["accept-encoding"] ?? "")
  const headers = {
    "content-type": types[ext] ?? "application/octet-stream",
    "cache-control": immutable
      ? "public, max-age=31536000, immutable"
      : "public, max-age=3600",
    vary: "Accept-Encoding",
  }

  if (immutable) {
    let entry = assets.get(file)
    if (!entry) {
      const body = await readFile(file)
      entry = {
        body,
        gz: compressible.has(ext) ? await gzipAsync(body, { level: 9 }) : null,
      }
      assets.set(file, entry)
    }
    const body = gzipped && entry.gz ? entry.gz : entry.body
    if (gzipped && entry.gz) headers["content-encoding"] = "gzip"
    headers["content-length"] = String(body.length)
    res.writeHead(200, headers)
    res.end(req.method === "HEAD" ? undefined : body)
    return true
  }

  if (gzipped) headers["content-encoding"] = "gzip"
  else headers["content-length"] = String(info.size)
  res.writeHead(200, headers)
  if (req.method === "HEAD") {
    res.end()
    return true
  }
  const source = createReadStream(file)
  if (gzipped) {
    await pipeline(source, createGzip(), res)
  } else {
    await pipeline(source, res)
  }
  return true
}

// the API rate limits per client address, so the address must survive the hop
function clientAddress(req) {
  return req.socket.remoteAddress ?? ""
}

async function render(req, res, url) {
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    if (value == null || name === "x-forwarded-for" || name === "x-real-ip") {
      continue
    }
    for (const v of [].concat(value)) headers.append(name, v)
  }
  const ip = clientAddress(req)
  if (ip) {
    headers.set("x-forwarded-for", ip)
    headers.set("x-real-ip", ip)
  }
  const hasBody = req.method !== "GET" && req.method !== "HEAD"
  const request = new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? Readable.toWeb(req) : undefined,
    duplex: hasBody ? "half" : undefined,
  })
  const response = await app.fetch(request)

  res.statusCode = response.status
  for (const [name, value] of response.headers) {
    if (name !== "set-cookie") res.setHeader(name, value)
  }
  const cookies = response.headers.getSetCookie()
  if (cookies.length) res.setHeader("set-cookie", cookies)
  if (!response.body || req.method === "HEAD") {
    res.end()
    return
  }
  const type = response.headers.get("content-type") ?? ""
  const gzipped =
    /^(text\/|application\/(json|javascript))/.test(type) &&
    !response.headers.has("content-encoding") &&
    /\bgzip\b/.test(req.headers["accept-encoding"] ?? "")
  try {
    if (gzipped) {
      res.removeHeader("content-length")
      res.setHeader("content-encoding", "gzip")
      res.setHeader("vary", "Accept-Encoding")
      await pipeline(Readable.fromWeb(response.body), createGzip(), res)
    } else {
      await pipeline(Readable.fromWeb(response.body), res)
    }
  } catch (err) {
    // the client went away mid response, nothing to report
    if (!res.destroyed && !res.writableEnded) throw err
  }
}

// Browsers only talk to this origin; the live stream is piped through to the API.
server.on("upgrade", (req, socket, head) => {
  if (req.url !== "/bff/live") {
    socket.destroy()
    return
  }
  socket.setNoDelay(true)
  const upstream = httpRequest({
    host: apiUrl.hostname,
    port: apiUrl.port || 80,
    method: "GET",
    path: `${apiUrl.pathname.replace(/\/$/, "")}/live`,
    headers: {
      ...req.headers,
      host: apiUrl.host,
      "x-forwarded-for": clientAddress(req),
      "x-real-ip": clientAddress(req),
    },
  })
  upstream.on("upgrade", (res, upstreamSocket, upstreamHead) => {
    const lines = ["HTTP/1.1 101 Switching Protocols"]
    for (const [name, value] of Object.entries(res.headers)) {
      for (const v of [].concat(value)) lines.push(`${name}: ${v}`)
    }
    socket.write(`${lines.join("\r\n")}\r\n\r\n`)
    if (upstreamHead.length) socket.write(upstreamHead)
    if (head.length) upstreamSocket.write(head)
    upstreamSocket.pipe(socket).pipe(upstreamSocket)
    upstreamSocket.on("error", () => socket.destroy())
    socket.on("error", () => upstreamSocket.destroy())
  })
  upstream.on("response", (res) => {
    socket.end(
      `HTTP/1.1 ${res.statusCode} ${res.statusMessage ?? ""}\r\nconnection: close\r\n\r\n`
    )
  })
  upstream.on("error", () => socket.destroy())
  upstream.end()
})

server.listen(port, host, () => {
  console.log(`web listening on http://${host}:${port}, api at ${apiUrl}`)
})

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 5000).unref()
  })
}
