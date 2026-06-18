import { renderEmailLayout } from '../layout'
import { escapeHtml } from '../sanitize'

export function platformInviteEmail({
  inviteUrl,
  invitedByEmail,
}: {
  inviteUrl: string
  invitedByEmail: string
}) {
  const safeInvitedBy = escapeHtml(invitedByEmail)

  const { html, text } = renderEmailLayout({
    preheader: `${invitedByEmail} invited you to join Roadmaps.`,
    paragraphs: [
      {
        html: 'Hi there,',
        text: 'Hi there,',
      },
      {
        html: `<strong>${safeInvitedBy}</strong> invited you to join Roadmaps.`,
        text: `${invitedByEmail} invited you to join Roadmaps.`,
      },
      {
        html: 'Roadmaps is a collaborative space for planning roadmaps, running dot voting sessions, and weighing options with property voting — all with your team in real time.',
        text: 'Roadmaps is a collaborative space for planning roadmaps, running dot voting sessions, and weighing options with property voting — all with your team in real time.',
      },
      {
        html: 'Click below to create your account and get started.',
        text: 'Use the link below to create your account and get started.',
      },
      {
        html: 'This invite expires in <strong>7 days</strong>.',
        text: 'This invite expires in 7 days.',
      },
    ],
    cta: {
      href: inviteUrl,
      label: 'Accept invite',
    },
    fallbackUrl: inviteUrl,
  })

  return {
    subject: "You're invited to Roadmaps",
    html,
    text,
  }
}
