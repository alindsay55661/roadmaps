import { renderEmailLayout } from '../layout'

export function passwordResetEmail({ resetUrl }: { resetUrl: string }) {
  const { html, text } = renderEmailLayout({
    preheader: 'Reset your Roadmaps password. This link expires in 1 hour.',
    paragraphs: [
      {
        html: 'Hi there,',
        text: 'Hi there,',
      },
      {
        html: 'We received a request to reset your Roadmaps password. If you made this request, click the button below to choose a new password.',
        text: 'We received a request to reset your Roadmaps password. If you made this request, use the link below to choose a new password.',
      },
      {
        html: 'This link expires in <strong>1 hour</strong>.',
        text: 'This link expires in 1 hour.',
      },
    ],
    cta: {
      href: resetUrl,
      label: 'Reset password',
    },
    fallbackUrl: resetUrl,
    footerNote: {
      html: 'If you didn&rsquo;t request a password reset, you can safely ignore this email. Your password will stay the same.',
      text: "If you didn't request a password reset, you can safely ignore this email. Your password will stay the same.",
    },
  })

  return {
    subject: 'Reset your Roadmaps password',
    html,
    text,
  }
}
