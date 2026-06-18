import type { DataResult } from 'utils/data'
import { dataError, dataSuccess } from 'utils/data'

export { escapeHtml, sanitizeEmailSubject } from './sanitize'
export {
  passwordResetEmail,
  platformInviteEmail,
  sessionShareEmail,
  sessionShareInviteEmail,
  teamInviteEmail,
} from './templates'

export type EmailPayload = {
  to: string
  subject: string
  html: string
  text?: string
}

export type EmailEnv = {
  EMAIL_PROVIDER?: string
  EMAIL_FROM?: string
  EMAIL_FROM_NAME?: string
  RESEND_API_KEY?: string
  POSTMARK_SERVER_TOKEN?: string
  SENDGRID_API_KEY?: string
}

export async function sendEmail(payload: EmailPayload, env: EmailEnv): Promise<DataResult<void>> {
  const provider = env.EMAIL_PROVIDER
  const from = env.EMAIL_FROM_NAME ? `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>` : env.EMAIL_FROM

  if (!provider || !from) {
    console.warn('[email] EMAIL_PROVIDER or EMAIL_FROM not set — logging email:', payload)
    return dataSuccess()
  }

  try {
    switch (provider) {
      case 'resend':
        return await sendResend(payload, from, env.RESEND_API_KEY)
      case 'postmark':
        return await sendPostmark(payload, from, env.POSTMARK_SERVER_TOKEN)
      case 'sendgrid':
        return await sendSendgrid(payload, from, env.SENDGRID_API_KEY)
      default:
        return dataError(`Unknown EMAIL_PROVIDER: ${provider}`)
    }
  } catch (error) {
    return dataError(error instanceof Error ? error.message : 'Failed to send email')
  }
}

async function sendResend(payload: EmailPayload, from: string, apiKey?: string): Promise<DataResult<void>> {
  if (!apiKey) return dataError('RESEND_API_KEY is required')

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    }),
  })

  if (!response.ok) return dataError(await response.text())
  return dataSuccess()
}

async function sendPostmark(
  payload: EmailPayload,
  from: string,
  serverToken?: string,
): Promise<DataResult<void>> {
  if (!serverToken) return dataError('POSTMARK_SERVER_TOKEN is required')

  const response = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'X-Postmark-Server-Token': serverToken,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      From: from,
      To: payload.to,
      Subject: payload.subject,
      HtmlBody: payload.html,
      TextBody: payload.text,
    }),
  })

  if (!response.ok) return dataError(await response.text())
  return dataSuccess()
}

async function sendSendgrid(payload: EmailPayload, from: string, apiKey?: string): Promise<DataResult<void>> {
  if (!apiKey) return dataError('SENDGRID_API_KEY is required')

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: payload.to }] }],
      from: { email: from.match(/<(.+)>/)?.[1] ?? from },
      subject: payload.subject,
      content: [
        { type: 'text/plain', value: payload.text ?? payload.subject },
        { type: 'text/html', value: payload.html },
      ],
    }),
  })

  if (!response.ok) return dataError(await response.text())
  return dataSuccess()
}
