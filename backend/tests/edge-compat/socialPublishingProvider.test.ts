import { it } from 'vitest'
import {
  buildFacebookPagePostRequest,
  buildGoogleBusinessProfilePostRequest,
  buildInstagramMediaContainerRequest,
  buildInstagramPublishRequest,
  executeSocialPublishingAction,
} from '../../src/lib/edge-compat/socialPublishingProvider.js'

function assert(condition: unknown, message = 'Assertion failed') {
  if (!condition) throw new Error(message)
}

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
  }
}

function assertStringIncludes(actual: string, expected: string) {
  assert(actual.includes(expected), `Expected ${actual} to include ${expected}`)
}

it('builds Facebook Page feed publish request', () => {
  const request = buildFacebookPagePostRequest({
    pageId: 'page-1',
    graphVersion: 'v20.0',
    accessToken: 'token',
    message: 'Post aprovado',
    link: 'https://example.com',
  })
  assertEquals(request.url, 'https://graph.facebook.com/v20.0/page-1/feed')
  assertEquals(request.method, 'POST')
  assertEquals(request.body.message, 'Post aprovado')
  assertEquals(request.body.link, 'https://example.com')
  assertEquals(request.body.access_token, 'token')
})

it('builds Instagram media container and publish requests', () => {
  const container = buildInstagramMediaContainerRequest({
    instagramAccountId: 'ig-1',
    graphVersion: 'v20.0',
    accessToken: 'token',
    caption: 'Legenda aprovada',
    imageUrl: 'https://cdn.example.com/image.jpg',
  })
  assertStringIncludes(container.url, '/ig-1/media')
  assertEquals(container.body.image_url, 'https://cdn.example.com/image.jpg')

  const publish = buildInstagramPublishRequest({
    instagramAccountId: 'ig-1',
    graphVersion: 'v20.0',
    accessToken: 'token',
    creationId: 'creation-1',
  })
  assertStringIncludes(publish.url, '/ig-1/media_publish')
  assertEquals(publish.body.creation_id, 'creation-1')
})

it('builds Google Business Profile local post request', () => {
  const request = buildGoogleBusinessProfilePostRequest({
    locationName: 'accounts/123/locations/456',
    accessToken: 'token',
    summary: 'Post local aprovado',
    ctaUrl: 'https://example.com/landing',
  })
  assertEquals(request.url, 'https://mybusiness.googleapis.com/v4/accounts/123/locations/456/localPosts')
  assertEquals(request.body.topicType, 'STANDARD')
  assertEquals(request.body.summary, 'Post local aprovado')
  assertEquals(request.body.callToAction, { actionType: 'LEARN_MORE', url: 'https://example.com/landing' })
})

it('executes Instagram publishing with container then publish call', async () => {
  const calls: string[] = []
  const fetcher = async (url: string | URL | Request) => {
    calls.push(String(url))
    return new Response(JSON.stringify(calls.length === 1 ? { id: 'creation-1' } : { id: 'media-1', permalink: 'https://instagram.com/p/media-1' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const result = await executeSocialPublishingAction({
    connection: { provider: 'meta_instagram', provider_asset_id: 'ig-1' },
    content: { title: 'Titulo', body: 'Legenda', metadata: { imageUrl: 'https://cdn.example.com/image.jpg' } },
    run: { action: 'publish', request_payload: {} },
    accessToken: 'secret-token',
    graphVersion: 'v20.0',
    fetcher,
  })

  assertEquals(calls.map(url => url.split('/').pop()), ['media', 'media_publish'])
  assertEquals(result.providerPostId, 'media-1')
  assert(!JSON.stringify(result.responsePayload).includes('secret-token'), 'response leaked access token')
})
