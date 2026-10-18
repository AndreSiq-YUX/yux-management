import { describe, expect, it } from 'vitest'
import {
  billingCycleLabel,
  channelLabel,
  formatCompactCurrency,
  formatDueLabel,
  formatPortalCurrency,
  formatPortalDate,
  formatPortalDateTime,
  formatRelativeTime,
  formatShortDate,
  roleLabel,
  statusLabel,
  ticketCategoryLabel,
  ticketPriorityLabel,
} from './portalDisplay'

// 17/10/2026 12:00 (horário local)
const NOW = new Date(2026, 9, 17, 12, 0, 0)
const at = (year: number, month: number, day: number, hour = 12, minute = 0) => new Date(year, month - 1, day, hour, minute)
const normalizeSpaces = (value: string) => value.replace(/\s/g, ' ')

describe('statusLabel', () => {
  it('uses accented pt-BR labels', () => {
    expect(statusLabel('completed')).toBe('Concluído')
    expect(statusLabel('in_review')).toBe('Em revisão')
    expect(statusLabel(undefined)).toBe('Não informado')
    expect(statusLabel('waiting_client')).toBe('Aguardando você')
    expect(statusLabel('pending_approval')).toBe('Aguardando aprovação')
    expect(statusLabel('needs_reauth')).toBe('Reconexão necessária')
    expect(statusLabel('COMPLETED')).toBe('Concluído')
    expect(statusLabel('PLANNING')).toBe('Em planejamento')
  })

  it('falls back to a readable version of unknown statuses', () => {
    expect(statusLabel('some_new_state')).toBe('some new state')
  })
})

describe('dictionaries', () => {
  it('labels channels', () => {
    expect(channelLabel('whatsapp')).toBe('WhatsApp')
    expect(channelLabel('webchat')).toBe('Chat do site')
    expect(channelLabel('instagram')).toBe('Instagram')
    expect(channelLabel('messenger')).toBe('Messenger')
    expect(channelLabel('facebook')).toBe('Messenger')
    expect(channelLabel('email')).toBe('E-mail')
    expect(channelLabel('sms')).toBe('SMS')
    expect(channelLabel('telegram')).toBe('Telegram')
    expect(channelLabel(undefined)).toBe('Não informado')
  })

  it('labels billing cycles', () => {
    expect(billingCycleLabel('monthly')).toBe('Mensal')
    expect(billingCycleLabel('quarterly')).toBe('Trimestral')
    expect(billingCycleLabel('semiannual')).toBe('Semestral')
    expect(billingCycleLabel('biannual')).toBe('Semestral')
    expect(billingCycleLabel('yearly')).toBe('Anual')
    expect(billingCycleLabel('annual')).toBe('Anual')
    expect(billingCycleLabel('one_time')).toBe('Pagamento único')
  })

  it('labels ticket categories and priorities', () => {
    expect(ticketCategoryLabel('technical')).toBe('Técnico')
    expect(ticketCategoryLabel('billing')).toBe('Financeiro')
    expect(ticketCategoryLabel('financial')).toBe('Financeiro')
    expect(ticketCategoryLabel('commercial')).toBe('Comercial')
    expect(ticketCategoryLabel('content')).toBe('Conteúdo')
    expect(ticketCategoryLabel('access')).toBe('Acesso')
    expect(ticketCategoryLabel('request')).toBe('Solicitação')
    expect(ticketCategoryLabel('other')).toBe('Outro')
    expect(ticketPriorityLabel('low')).toBe('Baixa')
    expect(ticketPriorityLabel('medium')).toBe('Média')
    expect(ticketPriorityLabel('high')).toBe('Alta')
    expect(ticketPriorityLabel('urgent')).toBe('Urgente')
  })

  it('labels roles', () => {
    expect(roleLabel('client')).toBe('Cliente')
    expect(roleLabel('client_admin')).toBe('Administrador da conta')
    expect(roleLabel('client_member')).toBe('Membro')
    expect(roleLabel('yux_admin')).toBe('Admin YUX')
    expect(roleLabel('yux_operator')).toBe('Operação YUX')
    expect(roleLabel('manager')).toBe('Gestor')
  })
})

describe('date formatters', () => {
  it('returns "Sem data" for missing or invalid values', () => {
    expect(formatPortalDate(undefined)).toBe('Sem data')
    expect(formatPortalDate('não é data')).toBe('Sem data')
    expect(formatPortalDateTime('não é data')).toBe('Sem data')
    expect(formatPortalDateTime('')).toBe('Sem data')
    expect(formatShortDate('xx', NOW)).toBe('Sem data')
    expect(formatRelativeTime('xx', NOW)).toBe('Sem data')
    expect(formatDueLabel('xx', NOW)).toBe('Sem data')
  })

  it('formats valid dates', () => {
    expect(formatPortalDate('2026-10-20T15:00:00')).toContain('2026')
    expect(formatPortalDateTime('2026-10-20T15:30:00')).toContain('15:30')
  })

  it('formats short dates, with the year only outside the current year', () => {
    expect(formatShortDate(at(2026, 10, 20), NOW)).toBe('20 out')
    expect(formatShortDate('2026-03-05', NOW)).toBe('5 mar')
    expect(formatShortDate(at(2025, 12, 31), NOW)).toBe('31 dez 2025')
  })

  it('formats relative time', () => {
    expect(formatRelativeTime(at(2026, 10, 17, 12, 0), NOW)).toBe('agora')
    expect(formatRelativeTime(at(2026, 10, 17, 11, 55), NOW)).toBe('há 5 min')
    expect(formatRelativeTime(at(2026, 10, 17, 10, 0), NOW)).toBe('há 2 h')
    expect(formatRelativeTime(at(2026, 10, 16, 9, 0), NOW)).toBe('ontem')
    expect(formatRelativeTime(at(2026, 10, 15, 12, 0), NOW)).toBe('há 2 dias')
    expect(formatRelativeTime(at(2026, 9, 1, 12, 0), NOW)).toBe('há 1 mês')
    expect(formatRelativeTime(at(2026, 10, 17, 12, 10), NOW)).toBe('em 10 min')
    expect(formatRelativeTime(at(2026, 10, 17, 15, 0), NOW)).toBe('em 3 h')
    expect(formatRelativeTime(at(2026, 10, 18, 9, 0), NOW)).toBe('amanhã')
    expect(formatRelativeTime(at(2026, 10, 20, 12, 0), NOW)).toBe('em 3 dias')
  })

  it('formats due labels by calendar day', () => {
    expect(formatDueLabel(at(2026, 10, 17, 23, 0), NOW)).toBe('vence hoje')
    expect(formatDueLabel('2026-10-18', NOW)).toBe('vence amanhã')
    expect(formatDueLabel('2026-10-20', NOW)).toBe('vence em 3 dias')
    expect(formatDueLabel('2026-10-16', NOW)).toBe('venceu ontem')
    expect(formatDueLabel('2026-10-15', NOW)).toBe('venceu há 2 dias')
  })
})

describe('currency formatters', () => {
  it('formats compact currency', () => {
    expect(formatCompactCurrency(186_400)).toBe('R$ 186,4 mil')
    expect(formatCompactCurrency(1_200_000)).toBe('R$ 1,2 mi')
    expect(formatCompactCurrency(1_000)).toBe('R$ 1 mil')
    expect(formatCompactCurrency(2_500_000_000)).toBe('R$ 2,5 bi')
    expect(formatCompactCurrency(-186_400)).toBe('-R$ 186,4 mil')
  })

  it('uses the normal currency below one thousand', () => {
    expect(normalizeSpaces(formatCompactCurrency(999))).toBe(normalizeSpaces(formatPortalCurrency(999)))
    expect(normalizeSpaces(formatCompactCurrency(0))).toBe('R$ 0,00')
    expect(normalizeSpaces(formatCompactCurrency(undefined))).toBe('R$ 0,00')
  })
})
