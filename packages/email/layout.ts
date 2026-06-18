import { escapeHtml } from './sanitize'

const BRAND_PRIMARY = '#0b5fdb'
const FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const MUTED_COLOR = '#64748b'
const TEXT_COLOR = '#0f172a'
const INNER_PADDING = '32px'

export type EmailCta = {
  href: string
  label: string
}

export type EmailParagraph = {
  html: string
  text: string
}

export type EmailLayoutOptions = {
  preheader?: string
  paragraphs: EmailParagraph[]
  cta: EmailCta
  fallbackUrl: string
  footerNote?: EmailParagraph
}

export type EmailLayoutResult = {
  html: string
  text: string
}

export function renderEmailButton({ href, label }: EmailCta) {
  const safeHref = escapeHtml(href)
  const safeLabel = escapeHtml(label)

  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;">
  <tr>
    <td align="left" bgcolor="${BRAND_PRIMARY}" style="border-radius:6px;">
      <a href="${safeHref}" target="_blank" style="display:inline-block;padding:12px 24px;font-family:${FONT_STACK};font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">
        ${safeLabel}
      </a>
    </td>
  </tr>
</table>`
}

export function renderEmailLayout({
  preheader,
  paragraphs,
  cta,
  fallbackUrl,
  footerNote,
}: EmailLayoutOptions): EmailLayoutResult {
  const safeFallbackUrl = escapeHtml(fallbackUrl)
  const paragraphHtml = paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;font-family:${FONT_STACK};font-size:16px;line-height:24px;color:${TEXT_COLOR};">${paragraph.html}</p>`,
    )
    .join('')

  const footerHtml = footerNote
    ? `<p style="margin:16px 0 0;font-family:${FONT_STACK};font-size:14px;line-height:20px;color:${MUTED_COLOR};">${footerNote.html}</p>`
    : ''

  const preheaderHtml = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>`
    : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Roadmaps</title>
</head>
<body style="margin:0;padding:0;">
  ${preheaderHtml}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="left">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="left" style="max-width:560px;">
          <tr>
            <td style="padding:${INNER_PADDING} ${INNER_PADDING} 8px 0;">
              <p style="margin:0;font-family:${FONT_STACK};font-size:20px;font-weight:700;color:${BRAND_PRIMARY};">Roadmaps</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px ${INNER_PADDING} ${INNER_PADDING} 0;">
              ${paragraphHtml}
              ${renderEmailButton(cta)}
              <p style="margin:0 0 8px;font-family:${FONT_STACK};font-size:14px;line-height:20px;color:${MUTED_COLOR};">
                If the button doesn&rsquo;t work, copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 16px;font-family:${FONT_STACK};font-size:14px;line-height:20px;word-break:break-all;">
                <a href="${safeFallbackUrl}" style="color:${BRAND_PRIMARY};text-decoration:underline;">${safeFallbackUrl}</a>
              </p>
              ${footerHtml}
              <p style="margin:24px 0 0;font-family:${FONT_STACK};font-size:14px;line-height:20px;color:${MUTED_COLOR};">&mdash; The Roadmaps team</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const textLines = [
    'Roadmaps',
    '',
    ...paragraphs.flatMap((paragraph) => [paragraph.text, '']),
    `${cta.label}: ${fallbackUrl}`,
    '',
    "If the button doesn't work, copy and paste this link into your browser:",
    fallbackUrl,
  ]

  if (footerNote) {
    textLines.push('', footerNote.text)
  }

  textLines.push('', '— The Roadmaps team')

  return {
    html,
    text: textLines
      .join('\n')
      .replace(/\n\n\n+/g, '\n\n')
      .trim(),
  }
}
