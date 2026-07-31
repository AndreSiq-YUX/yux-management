export type Smtp2GoSendInput = {
  apiKey?: string
  senderEmail?: string
  senderName?: string
  to: string
  subject: string
  textBody: string
  htmlBody: string
  customHeaders?: Array<{ header: string; value: string }>
}

export type EmailSendResult =
  | { sent: true; providerMessageId?: string }
  | {
      sent: false
      reason: 'smtp2go_not_configured' | 'smtp2go_rejected' | 'smtp2go_request_failed'
      error?: string
      diagnosticError?: unknown
    }

export async function sendSmtp2GoEmail(input: Smtp2GoSendInput): Promise<EmailSendResult> {
  if (!input.apiKey || !input.senderEmail) {
    return { sent: false, reason: 'smtp2go_not_configured' }
  }

  const sender = input.senderName
    ? `${input.senderName.replace(/[<>]/g, '').trim()} <${input.senderEmail}>`
    : input.senderEmail

  try {
    const response = await fetch('https://api.smtp2go.com/v3/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Smtp2go-Api-Key': input.apiKey,
      },
      body: JSON.stringify({
        sender,
        to: [input.to],
        subject: input.subject,
        text_body: input.textBody,
        html_body: input.htmlBody,
        custom_headers: input.customHeaders,
      }),
    })
    const body = await response.json().catch(() => null) as any

    if (!response.ok) {
      return {
        sent: false,
        reason: 'smtp2go_rejected',
        error: typeof body?.data?.error === 'string' ? body.data.error : `SMTP2GO returned ${response.status}`,
      }
    }

    return {
      sent: true,
      providerMessageId: body?.data?.email_id || body?.data?.email_ids?.[0] || undefined,
    }
  } catch (error) {
    return {
      sent: false,
      reason: 'smtp2go_request_failed',
      error: error instanceof Error ? error.message : 'SMTP2GO request failed',
    }
  }
}
