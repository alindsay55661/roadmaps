import { describe, expect, it } from 'vitest'

import { escapeHtml, sanitizeEmailSubject } from './sanitize'
import {
  passwordResetEmail,
  platformInviteEmail,
  sessionShareEmail,
  sessionShareInviteEmail,
  teamInviteEmail,
} from './templates'

const resetUrl = 'https://app.example.com/reset-password/abc-123'
const inviteUrl = 'https://app.example.com/invite/def-456'
const sessionUrl = 'https://app.example.com/roadmap/session-789'

describe('passwordResetEmail', () => {
  it('returns subject, html, and text', () => {
    const email = passwordResetEmail({ resetUrl })

    expect(email.subject).toBe('Reset your Roadmaps password')
    expect(email.html).toContain('<!DOCTYPE html>')
    expect(email.html).toContain('Reset password')
    expect(email.html).toContain(escapeHtml(resetUrl))
    expect(email.text).toContain(resetUrl)
    expect(email.text).toContain('1 hour')
  })

  it('includes a table-based CTA button with the reset URL', () => {
    const email = passwordResetEmail({ resetUrl })

    expect(email.html).toContain('role="presentation"')
    expect(email.html).toContain(`href="${escapeHtml(resetUrl)}"`)
  })
})

describe('platformInviteEmail', () => {
  it('includes inviter and invite URL', () => {
    const email = platformInviteEmail({
      inviteUrl,
      invitedByEmail: 'admin@example.com',
    })

    expect(email.subject).toBe("You're invited to Roadmaps")
    expect(email.html).toContain(escapeHtml('admin@example.com'))
    expect(email.html).toContain('Accept invite')
    expect(email.text).toContain('admin@example.com')
    expect(email.text).toContain(inviteUrl)
  })
})

describe('teamInviteEmail', () => {
  it('sanitizes team name in subject', () => {
    const email = teamInviteEmail({
      inviteUrl,
      teamName: 'Engineering\r\nBcc: attacker@evil.com',
      invitedByEmail: 'lead@example.com',
    })

    expect(email.subject).not.toContain('\r')
    expect(email.subject).not.toContain('\n')
    expect(email.subject).toContain('Engineering')
    expect(email.subject).toContain('Bcc: attacker@evil.com')
  })

  it('escapes HTML in team name and inviter', () => {
    const email = teamInviteEmail({
      inviteUrl,
      teamName: '<script>alert(1)</script>',
      invitedByEmail: 'lead@example.com',
    })

    expect(email.html).toContain(escapeHtml('<script>alert(1)</script>'))
    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('Join team')
  })
})

describe('sessionShareEmail', () => {
  it('escapes dynamic session content in HTML', () => {
    const email = sessionShareEmail({
      actorEmail: 'owner@example.com',
      sessionName: '<img onerror=alert(1)>',
      sessionUrl,
    })

    expect(email.html).toContain(escapeHtml('<img onerror=alert(1)>'))
    expect(email.html).not.toContain('<img onerror')
    expect(email.html).toContain('Open session')
    expect(email.html).toContain(`href="${escapeHtml(sessionUrl)}"`)
    expect(email.subject).toContain(sanitizeEmailSubject('<img onerror=alert(1)>'))
  })

  it('returns both html and text bodies', () => {
    const email = sessionShareEmail({
      actorEmail: 'owner@example.com',
      sessionName: 'Q3 Roadmap',
      sessionUrl,
    })

    expect(email.html.length).toBeGreaterThan(0)
    expect(email.text).toContain('Q3 Roadmap')
    expect(email.text).toContain(sessionUrl)
  })
})

describe('sessionShareInviteEmail', () => {
  it('includes invite URL and expiry note', () => {
    const email = sessionShareInviteEmail({
      actorEmail: 'owner@example.com',
      sessionName: 'Planning Session',
      inviteUrl,
    })

    expect(email.subject).toContain('Planning Session')
    expect(email.html).toContain('Accept invite')
    expect(email.html).toContain(`href="${escapeHtml(inviteUrl)}"`)
    expect(email.text).toContain('7 days')
    expect(email.text).toContain(inviteUrl)
  })
})

describe('escapeHtml', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml('<script>"\'&</script>')).toBe('&lt;script&gt;&quot;&#39;&amp;&lt;/script&gt;')
  })
})

describe('sanitizeEmailSubject', () => {
  it('removes newlines from subject values', () => {
    const sanitized = sanitizeEmailSubject('hello\r\nworld')

    expect(sanitized).not.toContain('\r')
    expect(sanitized).not.toContain('\n')
    expect(sanitized).toContain('hello')
    expect(sanitized).toContain('world')
  })
})
