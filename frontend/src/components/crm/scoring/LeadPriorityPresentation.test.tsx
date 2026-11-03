import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import type { CrmCockpitLead } from '@/types/crmCockpit'
import type { PrioritySummary } from '@/types/crmPriority'
import { TodayWorkQueue } from '../TodayWorkQueue'
import { PriorityBadge } from './LeadPriorityDetails'

const summary = (
  state: PrioritySummary['state'],
  queueOrder: number | null,
  priorityScore: number | null,
): PrioritySummary => ({
  activationId: 'active',
  versionId: 'version',
  state,
  queueOrder,
  priorityScore,
  fitScore: 100,
  temperatureScore: 0,
  coveragePercent: 100,
  fitBandLabel: 'Alto',
  temperatureBandLabel: 'Frio',
  queueId: 'queue',
  queueLabel: 'Acompanhar',
  recommendation: null,
})
const lead = (id: string, name: string, priority: PrioritySummary): CrmCockpitLead =>
  ({ id, name, status: 'open', priority }) as CrmCockpitLead

it('sorts by queue before score and keeps operational deadlines apart from the contact list', () => {
  const blocked = {
    ...lead('blocked', 'Conta bloqueada', summary('excluded', null, null)),
    nextFollowUpAt: '2026-10-30T12:00:00Z',
  }
  const markup = renderToStaticMarkup(
    <TodayWorkQueue
      leads={[
        lead('second', 'Fila dois', summary('ranked', 1, 100)),
        lead('first', 'Fila um', summary('ranked', 0, 40)),
        blocked,
      ]}
      onSelectLead={() => {}}
      now={new Date('2026-11-03T12:00:00Z')}
    />,
  )
  const [operations, ranked] = markup.split('aria-label="Ordem de prioridade comercial"')
  expect(operations).toContain('Conta bloqueada')
  expect(ranked).not.toContain('Conta bloqueada')
  expect(ranked.indexOf('Fila um')).toBeLessThan(ranked.indexOf('Fila dois'))
})

it('shows the pending state without an obsolete score', () => {
  const markup = renderToStaticMarkup(<PriorityBadge priority={summary('pending', null, null)} />)
  expect(markup).toContain('Calculando')
  expect(markup).not.toContain('/100')
})
