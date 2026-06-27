type SuggestedItem = { itemKey: string; label: string; description?: string; quantity?: number; unitValue?: number }
type PriceRule = { item_key: string; minimum_value: number | string; recommended_value: number | string; maximum_value: number | string }

export function normalizeSuggestedItems(items: SuggestedItem[], rules: PriceRule[]) {
  const rulesByKey = new Map(rules.map(rule => [rule.item_key, rule]))
  return items.map((item, orderIndex) => {
    const rule = rulesByKey.get(item.itemKey)
    const value = Number(item.unitValue ?? rule?.recommended_value ?? 0)
    const unitValue = rule
      ? Math.min(Number(rule.maximum_value), Math.max(Number(rule.minimum_value), value))
      : Math.max(0, value)
    return { ...item, quantity: Number(item.quantity || 1), unitValue, orderIndex }
  })
}

export function buildFallbackDraft({ template, diagnostic }: { template?: any; diagnostic?: any }) {
  const diagnosticSuffix = diagnostic?.summary ? `\n\nContexto do diagnostico: ${diagnostic.summary}` : ''
  return {
    scope: `${template?.scope || 'Implantacao conforme diagnostico comercial.'}${diagnosticSuffix}`,
    whatsappMessage: template?.whatsapp_message || 'Preparamos uma proposta para sua revisao.',
    emailSubject: template?.email_subject || 'Proposta comercial YUX',
    emailBody: template?.email_body || 'Segue a proposta comercial para revisao.',
    items: template?.default_items || [],
  }
}
