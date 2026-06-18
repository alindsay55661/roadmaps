import { renderEmailLayout } from '../layout'
import { escapeHtml, sanitizeEmailSubject } from '../sanitize'

export function sessionShareEmail({
  actorEmail,
  sessionName,
  sessionUrl,
}: {
  actorEmail: string
  sessionName: string
  sessionUrl: string
}) {
  const safeActorEmail = escapeHtml(actorEmail)
  const safeSessionName = escapeHtml(sessionName)

  const { html, text } = renderEmailLayout({
    preheader: `${actorEmail} shared "${sessionName}" with you on Roadmaps.`,
    paragraphs: [
      {
        html: 'Hi there,',
        text: 'Hi there,',
      },
      {
        html: `<strong>${safeActorEmail}</strong> shared <strong>${safeSessionName}</strong> with you on Roadmaps.`,
        text: `${actorEmail} shared "${sessionName}" with you on Roadmaps.`,
      },
      {
        html: 'You can open the session below to view and collaborate in real time with your team.',
        text: 'You can open the session using the link below to view and collaborate in real time with your team.',
      },
    ],
    cta: {
      href: sessionUrl,
      label: 'Open session',
    },
    fallbackUrl: sessionUrl,
  })

  return {
    subject: `${sanitizeEmailSubject(actorEmail)} shared "${sanitizeEmailSubject(sessionName)}" with you`,
    html,
    text,
  }
}

export function sessionShareInviteEmail({
  actorEmail,
  sessionName,
  inviteUrl,
}: {
  actorEmail: string
  sessionName: string
  inviteUrl: string
}) {
  const safeActorEmail = escapeHtml(actorEmail)
  const safeSessionName = escapeHtml(sessionName)

  const { html, text } = renderEmailLayout({
    preheader: `${actorEmail} shared "${sessionName}" with you on Roadmaps.`,
    paragraphs: [
      {
        html: 'Hi there,',
        text: 'Hi there,',
      },
      {
        html: `<strong>${safeActorEmail}</strong> shared <strong>${safeSessionName}</strong> with you on Roadmaps.`,
        text: `${actorEmail} shared "${sessionName}" with you on Roadmaps.`,
      },
      {
        html: 'Create your free account to access this shared session and start collaborating with your team.',
        text: 'Create your free account to access this shared session and start collaborating with your team.',
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
    subject: `${sanitizeEmailSubject(actorEmail)} shared "${sanitizeEmailSubject(sessionName)}" with you on Roadmaps`,
    html,
    text,
  }
}
