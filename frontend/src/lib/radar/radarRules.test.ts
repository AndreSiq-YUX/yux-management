import { describe, expect, it } from 'vitest'
import {
  buildRadarDedupeKey,
  canConvertRadarOpportunity,
  canShowRadarNavigation,
  defaultRadarPolicyDecision,
  getRadarCompanyDisplayName,
  getRadarScoreTone,
} from './radarRules'

describe('radarRules', () => {
  it('shows radar only in the internal YUX growth workspace', () => {
    expect(canShowRadarNavigation({
      mode: 'client_workspace',
      organization: { id: 'org-1', name: 'Crescimento YUX', slug: 'yux', kind: 'yux', isInternalGrowthWorkspace: true, createdAt: '', updatedAt: '' },
      membership: null,
      role: { key: 'yux_admin', name: 'Admin', scope: 'internal', permissions: ['platform.manage'] },
      enabledModuleKeys: ['crm'],
    })).toBe(true)

    expect(canShowRadarNavigation({
      mode: 'portal',
      organization: { id: 'org-1', name: 'Cliente', slug: 'cliente', kind: 'client', createdAt: '', updatedAt: '' },
      membership: null,
      role: { key: 'client_admin', name: 'Cliente', scope: 'client', permissions: ['crm.read'] },
      enabledModuleKeys: ['crm'],
    })).toBe(false)

    expect(canShowRadarNavigation({
      mode: 'client_workspace',
      organization: { id: 'org-2', name: 'Cliente', slug: 'cliente', kind: 'client', isInternalGrowthWorkspace: false, createdAt: '', updatedAt: '' },
      membership: null,
      role: { key: 'yux_admin', name: 'Admin', scope: 'internal', permissions: ['platform.manage'] },
      enabledModuleKeys: ['crm'],
    })).toBe(false)
  })

  it('allows yux_operator or platform.manage roles for internal workspace access', () => {
    const context = {
      mode: 'client_workspace' as const,
      organization: { id: 'org-1', name: 'Crescimento YUX', slug: 'yux', kind: 'yux' as const, isInternalGrowthWorkspace: true, createdAt: '', updatedAt: '' },
      membership: null,
      enabledModuleKeys: ['crm'],
    }

    expect(canShowRadarNavigation({
      ...context,
      role: { key: 'yux_operator', name: 'Operador', scope: 'internal', permissions: [] },
    })).toBe(true)

    expect(canShowRadarNavigation({
      ...context,
      role: { key: 'custom_admin', name: 'Custom', scope: 'internal', permissions: ['platform.manage'] },
    })).toBe(true)

    expect(canShowRadarNavigation({
      ...context,
      role: { key: 'client_admin', name: 'Cliente', scope: 'client', permissions: ['platform.manage'] },
    })).toBe(false)
  })

  it('builds stable dedupe keys from cnpj, domain, phone or name city', () => {
    expect(buildRadarDedupeKey({ cnpj: '12.345.678/0001-90' })).toBe('cnpj:12345678000190')
    expect(buildRadarDedupeKey({ websiteUrl: 'https://www.Example.com/page' })).toBe('domain:example.com')
    expect(buildRadarDedupeKey({ phoneRaw: '(43) 99999-0000' })).toBe('phone:43999990000')
    expect(buildRadarDedupeKey({ tradeName: 'Clinica Boa Vida', city: 'Londrina', state: 'PR' })).toBe('name_city:clinica-boa-vida:londrina:pr')
  })

  it('requires human approval and blocks automatic send by default', () => {
    expect(defaultRadarPolicyDecision()).toMatchObject({
      status: 'requires_human_approval',
      canSendAutomatically: false,
      canConvertToLead: true,
    })
  })

  it('allows conversion only after approved opportunity and approved message', () => {
    expect(canConvertRadarOpportunity({
      status: 'approved',
      convertedLeadId: undefined,
      latestMessageSuggestion: {
        id: 'message-1',
        channel: 'email',
        body: 'Oi',
        evidenceUsed: [],
        policyDecision: defaultRadarPolicyDecision(),
        status: 'approved',
        createdAt: '',
        updatedAt: '',
      },
    })).toBe(true)

    expect(canConvertRadarOpportunity({
      status: 'approved',
      convertedLeadId: undefined,
      latestMessageSuggestion: {
        id: 'message-1',
        channel: 'email',
        body: 'Oi',
        evidenceUsed: [],
        policyDecision: defaultRadarPolicyDecision(),
        status: 'draft',
        createdAt: '',
        updatedAt: '',
      },
    })).toBe(false)
  })

  it('builds display fallbacks and score tones for the workspace shell', () => {
    expect(getRadarCompanyDisplayName({ tradeName: 'Clinica Boa Vida' })).toBe('Clinica Boa Vida')
    expect(getRadarCompanyDisplayName({ websiteUrl: 'https://example.com' })).toBe('https://example.com')
    expect(getRadarScoreTone(82)).toBe('high')
    expect(getRadarScoreTone(62)).toBe('medium')
    expect(getRadarScoreTone(32)).toBe('low')
    expect(getRadarScoreTone()).toBe('unknown')
  })
})
