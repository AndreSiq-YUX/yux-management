const LEAD_SOURCE_LABELS: Record<string, string> = {
  paid_campaign: 'Campanha paga',
  landing_page: 'Landing page',
  whatsapp_cta: 'WhatsApp',
  whatsapp: 'WhatsApp',
  organic: 'Orgânico',
  referral: 'Indicação',
  manual: 'Manual',
}

/** Nome em português da origem de um lead (o valor técnico nunca aparece para o cliente). */
export function leadSourceLabel(kind?: string | null, fallback?: string | null): string {
  if (kind && LEAD_SOURCE_LABELS[kind]) return LEAD_SOURCE_LABELS[kind]
  return fallback || kind || 'Não informado'
}
