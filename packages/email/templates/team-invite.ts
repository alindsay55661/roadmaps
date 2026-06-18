import { renderEmailLayout } from '../layout'
import { escapeHtml, sanitizeEmailSubject } from '../sanitize'

export function teamInviteEmail({
  inviteUrl,
  teamName,
  invitedByEmail,
}: {
  inviteUrl: string
  teamName: string
  invitedByEmail: string
}) {
  const safeTeamName = escapeHtml(teamName)
  const safeInvitedBy = escapeHtml(invitedByEmail)
  const displayTeamName = teamName || 'your team'

  const { html, text } = renderEmailLayout({
    preheader: `${invitedByEmail} invited you to join ${displayTeamName} on Roadmaps.`,
    paragraphs: [
      {
        html: 'Hi there,',
        text: 'Hi there,',
      },
      {
        html: `<strong>${safeInvitedBy}</strong> invited you to join <strong>${safeTeamName || 'your team'}</strong> on Roadmaps.`,
        text: `${invitedByEmail} invited you to join ${displayTeamName} on Roadmaps.`,
      },
      {
        html: 'Accept the invite to create your account and land directly in your team workspace, where you can collaborate on roadmaps and voting sessions together.',
        text: 'Accept the invite to create your account and land directly in your team workspace, where you can collaborate on roadmaps and voting sessions together.',
      },
      {
        html: 'This invite expires in <strong>7 days</strong>.',
        text: 'This invite expires in 7 days.',
      },
    ],
    cta: {
      href: inviteUrl,
      label: 'Join team',
    },
    fallbackUrl: inviteUrl,
  })

  return {
    subject: `Join ${sanitizeEmailSubject(displayTeamName)} on Roadmaps`,
    html,
    text,
  }
}
