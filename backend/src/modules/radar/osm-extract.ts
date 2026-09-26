import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import type pg from 'pg'
import { createOSMStream } from 'osm-pbf-parser-node'
import { matchRadarOsmSegment, RADAR_OSM_SEGMENT_MAP_VERSION, type RadarOsmSegmentKey } from './osm-segment-map.js'

type Position = [longitude: number, latitude: number]
type Ring = Position[]
type Polygon = Ring[]
type BoundaryGeometry = { type: 'Polygon'; coordinates: Polygon } | { type: 'MultiPolygon'; coordinates: Polygon[] }

type OsmEntity = {
  type?: string
  id?: number
  lat?: number
  lon?: number
  refs?: number[]
  tags?: Record<string, string>
  osmosis_replication_timestamp?: number
}

export type RadarOsmPlace = {
  osmType: 'node' | 'way'
  osmId: number
  segmentKey: RadarOsmSegmentKey
  name: string
  latitude: number
  longitude: number
  address: string | null
  website: string | null
  phone: string | null
  email: string | null
  sourceUrl: string
  tags: Record<string, string>
}

export type RadarOsmBoundary = {
  municipalityCode: string
  city: string
  state: string
  geometry: BoundaryGeometry
  source: string
}

const STATE_CODES: Record<string, string> = {
  AC: '12', AL: '27', AP: '16', AM: '13', BA: '29', CE: '23', DF: '53', ES: '32',
  GO: '52', MA: '21', MT: '51', MS: '50', MG: '31', PA: '15', PB: '25', PR: '41',
  PE: '26', PI: '22', RJ: '33', RN: '24', RS: '43', RO: '11', RR: '14', SC: '42',
  SP: '35', SE: '28', TO: '17',
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
}

function isPosition(value: unknown): value is Position {
  return Array.isArray(value) && value.length >= 2
    && typeof value[0] === 'number' && Number.isFinite(value[0]) && value[0] >= -180 && value[0] <= 180
    && typeof value[1] === 'number' && Number.isFinite(value[1]) && value[1] >= -90 && value[1] <= 90
}

function validPolygon(value: unknown): value is Polygon {
  return Array.isArray(value) && value.length > 0 && value.every(ring =>
    Array.isArray(ring) && ring.length >= 4 && ring.every(isPosition),
  )
}

function validGeometry(value: unknown): value is BoundaryGeometry {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { type?: string; coordinates?: unknown }
  if (candidate.type === 'Polygon') return validPolygon(candidate.coordinates)
  if (candidate.type === 'MultiPolygon') {
    return Array.isArray(candidate.coordinates) && candidate.coordinates.length > 0
      && candidate.coordinates.every(validPolygon)
  }
  return false
}

export function parseRadarOsmBoundary(input: unknown, selector: {
  municipalityCode: string
  city: string
  state: string
  source: string
}): RadarOsmBoundary {
  const state = selector.state.toUpperCase()
  if (!/^\d{7}$/.test(selector.municipalityCode) || !STATE_CODES[state]
    || !selector.municipalityCode.startsWith(STATE_CODES[state])) {
    throw new Error('radar_osm_invalid_municipality_code')
  }
  const document = input as { type?: string; features?: unknown[]; geometry?: unknown; properties?: Record<string, unknown> }
  const features = document?.type === 'FeatureCollection' ? document.features : [document]
  if (!Array.isArray(features)) throw new Error('radar_osm_invalid_boundary')
  const feature = features.find(item => {
    const properties = (item as { properties?: Record<string, unknown> })?.properties
    return String(properties?.CD_MUN ?? properties?.CD_GEOCMU ?? properties?.codarea ?? '') === selector.municipalityCode
  }) as { geometry?: unknown; properties?: Record<string, unknown> } | undefined
  if (!feature || !validGeometry(feature.geometry)) throw new Error('radar_osm_boundary_not_found')
  const featureName = String(feature.properties?.NM_MUN ?? feature.properties?.NM_MUNICIP ?? '')
  if (featureName && normalize(featureName) !== normalize(selector.city)) throw new Error('radar_osm_boundary_city_mismatch')
  const featureState = String(feature.properties?.SIGLA_UF ?? '')
  if (featureState && featureState.toUpperCase() !== state) throw new Error('radar_osm_boundary_state_mismatch')
  return {
    municipalityCode: selector.municipalityCode,
    city: selector.city.trim(),
    state,
    geometry: feature.geometry,
    source: selector.source,
  }
}

export function validateRadarOsmLocality(input: unknown, selector: { municipalityCode: string; city: string; state: string }) {
  const locality = input as { id?: number; nome?: string; microrregiao?: { mesorregiao?: { UF?: { sigla?: string } } } }
  if (String(locality?.id ?? '') !== selector.municipalityCode
    || normalize(locality?.nome ?? '') !== normalize(selector.city)
    || locality?.microrregiao?.mesorregiao?.UF?.sigla !== selector.state.toUpperCase()) {
    throw new Error('radar_osm_locality_identity_mismatch')
  }
}

function pointInRing(point: Position, ring: Ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if ((yi > point[1]) !== (yj > point[1])
      && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function pointInRadarOsmBoundary(longitude: number, latitude: number, boundary: RadarOsmBoundary) {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return false
  const polygons = boundary.geometry.type === 'Polygon'
    ? [boundary.geometry.coordinates]
    : boundary.geometry.coordinates
  return polygons.some(polygon => pointInRing([longitude, latitude], polygon[0])
    && !polygon.slice(1).some(hole => pointInRing([longitude, latitude], hole)))
}

function boundedTag(tags: Record<string, string>, key: string, max = 320): string | null {
  const value = tags[key]?.trim()
  return value ? value.slice(0, max) : null
}

function websiteTag(tags: Record<string, string>) {
  const value = boundedTag(tags, 'website') ?? boundedTag(tags, 'contact:website')
  if (!value) return null
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null
  } catch {
    return null
  }
}

function makePlace(entity: OsmEntity, latitude: number, longitude: number, segmentKey: RadarOsmSegmentKey): RadarOsmPlace | null {
  const name = entity.tags && boundedTag(entity.tags, 'name', 240)
  if (!name || !entity.id || (entity.type !== 'node' && entity.type !== 'way')) return null
  const tags = entity.tags ?? {}
  const address = [boundedTag(tags, 'addr:street'), boundedTag(tags, 'addr:housenumber')].filter(Boolean).join(', ')
  return {
    osmType: entity.type,
    osmId: entity.id,
    segmentKey,
    name,
    latitude,
    longitude,
    address: address || null,
    website: websiteTag(tags),
    phone: boundedTag(tags, 'phone') ?? boundedTag(tags, 'contact:phone'),
    email: boundedTag(tags, 'email') ?? boundedTag(tags, 'contact:email'),
    sourceUrl: `https://www.openstreetmap.org/${entity.type}/${entity.id}`,
    tags: Object.fromEntries(Object.entries(tags).filter(([key]) => [
      'amenity','healthcare','name','website','contact:website','phone','contact:phone',
      'email','contact:email','addr:street','addr:housenumber',
    ].includes(key))),
  }
}

export async function collectRadarOsmPlaces(
  firstPass: AsyncIterable<OsmEntity>,
  secondPass: AsyncIterable<OsmEntity>,
  boundary: RadarOsmBoundary,
  segmentKey: RadarOsmSegmentKey = 'medical_clinics',
): Promise<{ places: RadarOsmPlace[]; skippedRelations: number; skippedWays: number }> {
  const places: RadarOsmPlace[] = []
  const ways: OsmEntity[] = []
  const wantedRefs = new Set<number>()
  let skippedRelations = 0
  let skippedWays = 0
  for await (const entity of firstPass) {
    if (!entity.tags || !matchRadarOsmSegment(entity.tags, segmentKey)) continue
    if (entity.type === 'relation') { skippedRelations++; continue }
    if (entity.type === 'node') {
      if (typeof entity.lon === 'number' && typeof entity.lat === 'number'
        && pointInRadarOsmBoundary(entity.lon, entity.lat, boundary)) {
        const place = makePlace(entity, entity.lat, entity.lon, segmentKey)
        if (place) places.push(place)
      }
    } else if (entity.type === 'way' && Array.isArray(entity.refs) && entity.refs.length >= 3) {
      ways.push(entity)
      entity.refs.forEach(ref => wantedRefs.add(ref))
    }
  }
  const positions = new Map<number, Position>()
  if (ways.length > 0) {
    for await (const entity of secondPass) {
      if (entity.type === 'node' && entity.id && wantedRefs.has(entity.id)
        && typeof entity.lon === 'number' && typeof entity.lat === 'number') {
        positions.set(entity.id, [entity.lon, entity.lat])
      }
    }
  }
  for (const way of ways) {
    const refs = way.refs ?? []
    const uniqueRefs = refs.length > 1 && refs[0] === refs[refs.length - 1] ? refs.slice(0, -1) : refs
    const coordinates = uniqueRefs.map(ref => positions.get(ref))
    if (coordinates.length < 3 || coordinates.some(position => !position)) { skippedWays++; continue }
    const longitude = coordinates.reduce((sum, position) => sum + position![0], 0) / coordinates.length
    const latitude = coordinates.reduce((sum, position) => sum + position![1], 0) / coordinates.length
    if (!pointInRadarOsmBoundary(longitude, latitude, boundary)) continue
    const place = makePlace(way, latitude, longitude, segmentKey)
    if (place) places.push(place)
  }
  return { places, skippedRelations, skippedWays }
}

async function sha256File(path: string) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

export type RadarOsmExtractInput = {
  path: string
  boundaryPath: string
  localityPath: string
  municipalityCode: string
  city: string
  state: string
  regionKey: string
  sourceUrl: string
  boundarySource: string
  extractedAt?: string
  segmentKey?: RadarOsmSegmentKey
}

export async function previewRadarOsmExtract(input: RadarOsmExtractInput) {
  const file = await stat(input.path)
  if (!file.isFile() || file.size < 1024 || file.size > 2_000_000_000) throw new Error('radar_osm_invalid_extract_file')
  const headerStream = createOSMStream(input.path) as AsyncIterable<OsmEntity>
  let headerTimestamp: number | undefined
  for await (const entity of headerStream) { headerTimestamp = entity.osmosis_replication_timestamp; break }
  if (!Number.isInteger(headerTimestamp)) throw new Error('radar_osm_extract_timestamp_missing')
  const extractedAt = new Date(headerTimestamp! * 1000)
  if (!Number.isFinite(extractedAt.getTime()) || extractedAt.getTime() > Date.now()
    || Date.now() - extractedAt.getTime() > 90 * 86400_000) throw new Error('radar_osm_extract_date_invalid_or_old')
  if (input.extractedAt && Math.abs(new Date(input.extractedAt).getTime() - extractedAt.getTime()) > 60_000)
    throw new Error('radar_osm_extract_date_mismatch')
  const boundary = parseRadarOsmBoundary(JSON.parse(await readFile(input.boundaryPath, 'utf8')) as unknown, {
    municipalityCode: input.municipalityCode,
    city: input.city,
    state: input.state,
    source: input.boundarySource,
  })
  validateRadarOsmLocality(JSON.parse(await readFile(input.localityPath, 'utf8')) as unknown, {
    municipalityCode: input.municipalityCode, city: input.city, state: input.state,
  })
  const { places, skippedRelations, skippedWays } = await collectRadarOsmPlaces(
    createOSMStream(input.path) as AsyncIterable<OsmEntity>,
    createOSMStream(input.path, { withTags: false }) as AsyncIterable<OsmEntity>,
    boundary,
    input.segmentKey,
  )
  if (places.length === 0) throw new Error('radar_osm_no_matching_places')
  const sourceSha256 = await sha256File(input.path)
  return { boundary, places, skippedRelations, skippedWays, sourceSha256, extractedAt }
}

export async function importRadarOsmExtract(pool: pg.Pool, input: RadarOsmExtractInput): Promise<{ imported: number; skipped: number; snapshotId: string }> {
  const { boundary, places, skippedRelations, skippedWays, sourceSha256, extractedAt } = await previewRadarOsmExtract(input)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const snapshot = await client.query<{ id: string }>(
      `INSERT INTO public.radar_osm_snapshots
        (municipality_code, city, state, region_key, source_url, source_sha256, boundary_source, extracted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [boundary.municipalityCode, boundary.city, boundary.state, input.regionKey, input.sourceUrl,
        sourceSha256, boundary.source, extractedAt.toISOString()],
    )
    const snapshotId = snapshot.rows[0].id
    for (const place of places) {
      await client.query(
        `INSERT INTO public.radar_osm_places
          (snapshot_id, osm_type, osm_id, segment_key, name, latitude, longitude,
           address, website, phone, email, source_url, tags)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [snapshotId, place.osmType, place.osmId, place.segmentKey, place.name,
          place.latitude, place.longitude, place.address, place.website, place.phone,
          place.email, place.sourceUrl, JSON.stringify(place.tags)],
      )
    }
    await client.query(
      `UPDATE public.radar_osm_snapshots SET status = 'superseded'
       WHERE municipality_code = $1 AND status = 'active'`,
      [boundary.municipalityCode],
    )
    await client.query(
      `UPDATE public.radar_osm_snapshots SET status = 'active', place_count = $2 WHERE id = $1`,
      [snapshotId, places.length],
    )
    await client.query('COMMIT')
    return { imported: places.length, skipped: skippedRelations + skippedWays, snapshotId }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export { RADAR_OSM_SEGMENT_MAP_VERSION }
