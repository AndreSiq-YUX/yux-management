import { describe, expect, it } from 'vitest'
import { calculateLandingPageMetrics, sanitizeLandingPageForPortal } from './landingPageRules'
import type { LandingPage } from '@/types/landingPage'

const page: LandingPage = {
  id: 'lp-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  name: 'Botox Junho',
  slug: 'botox-junho',
  status: 'active',
  previewUrl: 'https://preview.example.com/botox',
  publishedUrl: 'https://example.com/botox',
  thumbnailUrl: 'https://example.com/thumb.jpg',
  primaryCtaType: 'form',
  primaryCtaValue: 'Agendar avaliacao',
  visits: 1000,
  leads: 83,
  pendingApprovals: 1,
  internalNotes: 'Cliente pediu headline alternativa',
  createdAt: '2026-06-03T10:00:00.000Z',
  updatedAt: '2026-06-03T10:00:00.000Z',
  versions: [
    {
      id: 'version-1',
      landingPageId: 'lp-1',
      versionNumber: 1,
      title: 'Versao publica',
      status: 'published',
      internalOnly: false,
      createdAt: '2026-06-03T10:00:00.000Z',
      updatedAt: '2026-06-03T10:00:00.000Z',
    },
    {
      id: 'version-2',
      landingPageId: 'lp-1',
      versionNumber: 2,
      title: 'Teste interno',
      status: 'draft',
      internalOnly: true,
      createdAt: '2026-06-03T10:00:00.000Z',
      updatedAt: '2026-06-03T10:00:00.000Z',
    },
  ],
}

describe('landingPageRules', () => {
  it('removes internal landing page data from portal payloads', () => {
    expect(sanitizeLandingPageForPortal(page)).not.toHaveProperty('internalNotes')
    expect(sanitizeLandingPageForPortal(page).versions.every(version => !version.internalOnly)).toBe(true)
  })

  it('calculates landing page conversion metrics', () => {
    expect(calculateLandingPageMetrics({ visits: 1000, leads: 83 }).conversionRate).toBe(8.3)
  })
})
