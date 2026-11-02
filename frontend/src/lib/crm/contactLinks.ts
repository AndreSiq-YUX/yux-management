export function safeLeadUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return
  try {
    const url = new URL(value)
    if (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    )
      return url.href
  } catch {
    /* Unusable historical links are not clickable. */
  }
}
