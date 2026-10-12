import { afterEach, expect, it } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { createRadarPinnedLookup, getRadarPublicPage, inspectRadarBusinessSite } from '../src/modules/radar/b2b-site-inspection.js'

const servers: http.Server[] = []
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
  server.closeAllConnections(); server.close(() => resolve())
}))) })
async function serve(handler: http.RequestListener) {
  const server = http.createServer(handler); servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return new URL(`http://unresolved.example:${(server.address() as AddressInfo).port}/`)
}
it('honors both DNS callback contracts without resolving a different address', () => {
  const lookup = createRadarPinnedLookup('8.8.8.8')
  lookup('ignored.example', { all: true }, (error, addresses) => {
    expect(error).toBeNull(); expect(addresses).toEqual([{ address: '8.8.8.8', family: 4 }])
  })
  lookup('ignored.example', {}, (error, address, family) => {
    expect(error).toBeNull(); expect(address).toBe('8.8.8.8'); expect(family).toBe(4)
  })
})
it('uses the native Node transport with a pinned address and original Host', async () => {
  const url = await serve((req, res) => {
    expect(req.headers.host).toContain('unresolved.example:')
    res.writeHead(200, { 'content-type': 'text/html' }); res.end('<h1>Public company</h1>')
  })
  expect((await getRadarPublicPage(url, '127.0.0.1')).body).toContain('Public company')
  // The transport test helper does not weaken the public inspector's SSRF checks.
  expect((await inspectRadarBusinessSite(url.toString())).status).toBe('blocked')
})
it('reads modern pages but rejects excessive HTML and robots responses', async () => {
  const url = await serve((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(req.url === '/large' ? 'x'.repeat(2 * 1024 * 1024 + 1)
      : req.url === '/robots.txt' ? 'x'.repeat(256 * 1024 + 1) : `<h1>Company</h1>${' '.repeat(750 * 1024)}`)
  })
  expect((await getRadarPublicPage(url, '127.0.0.1')).body).toContain('Company')
  await expect(getRadarPublicPage(new URL('/large', url), '127.0.0.1')).rejects.toThrow('page_too_large')
  await expect(getRadarPublicPage(new URL('/robots.txt', url), '127.0.0.1')).rejects.toThrow('page_too_large')
})
it('rejects an interrupted response instead of hanging', async () => {
  const url = await serve((_req, res) => { res.writeHead(200); res.write('partial'); res.destroy() })
  await expect(getRadarPublicPage(url, '127.0.0.1')).rejects.toThrow()
})
it('bounds a response even when the connection remains open',async()=>{
  const url=await serve((_req,res)=>{res.writeHead(200);res.write('waiting')})
  await expect(getRadarPublicPage(url,'127.0.0.1')).rejects.toThrow('timeout')
},12000)
