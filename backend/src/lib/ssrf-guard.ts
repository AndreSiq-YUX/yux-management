import { lookup as defaultLookup } from 'node:dns/promises'
import { isIP } from 'node:net'

type LookupResult = { address: string }
type Lookup = (hostname: string, options: { all: true }) => Promise<LookupResult[]>

function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase()
  return /^10\./.test(normalized)
    || /^127\./.test(normalized)
    || /^169\.254\./.test(normalized)
    || /^192\.168\./.test(normalized)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(normalized)
    || /^0\./.test(normalized)
    || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(normalized)
    || normalized === '::'
    || normalized === '::1'
    || /^::ffff:(0a|7f|a9fe|c0a8)/.test(normalized)
    || /^(fc|fd|fe[89ab])/.test(normalized)
}

export async function assertPublicHttpsUrl(rawUrl: string, lookup: Lookup = defaultLookup as Lookup) {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('invalid_url')
  }
  if (url.protocol !== 'https:') throw new Error('only_https_allowed')
  if (url.username || url.password) throw new Error('url_credentials_not_allowed')
  const host = url.hostname.toLowerCase()
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) throw new Error('private_address_blocked')
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true })
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error('private_address_blocked')
  return url
}
