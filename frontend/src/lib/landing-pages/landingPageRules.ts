import type { LandingPage, LandingPageMetrics, LandingPageMetricsInput, PortalLandingPage } from '@/types/landingPage'

export function calculateLandingPageMetrics(input: LandingPageMetricsInput): LandingPageMetrics {
  return {
    visits: input.visits,
    leads: input.leads,
    conversionRate: input.visits <= 0 ? 0 : Math.round((input.leads / input.visits) * 1000) / 10,
  }
}

export function sanitizeLandingPageForPortal(page: LandingPage): PortalLandingPage {
  const { internalNotes: _internalNotes, versions, ...safePage } = page

  return {
    ...safePage,
    versions: versions.filter(version => !version.internalOnly),
  }
}

export function calculateLandingPageSummary(pages: LandingPage[]) {
  const visits = pages.reduce((sum, page) => sum + page.visits, 0)
  const leads = pages.reduce((sum, page) => sum + page.leads, 0)

  return {
    activePages: pages.filter(page => page.status === 'active').length,
    leads,
    pendingApprovals: pages.reduce((sum, page) => sum + page.pendingApprovals, 0),
    conversionRate: calculateLandingPageMetrics({ visits, leads }).conversionRate,
  }
}
