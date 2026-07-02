import { describe, expect, it } from 'vitest'

import { formatInviteExpiry, getInviteExpiresAt, isInviteExpired } from './invite-expiry'

describe('invite-expiry', () => {
  it('adds seven days to the current timestamp', () => {
    expect(getInviteExpiresAt(1_000)).toBe(1_000 + 60 * 60 * 24 * 7)
  })

  it('detects expired invites', () => {
    expect(isInviteExpired(100, 200)).toBe(true)
    expect(isInviteExpired(200, 200)).toBe(false)
  })

  it('formats active and expired invites', () => {
    const now = Math.floor(new Date('2026-07-01T12:00:00Z').getTime() / 1000)
    expect(formatInviteExpiry(now - 1)).toBe('Expired')
    expect(formatInviteExpiry(now + 60 * 60 * 24)).toMatch(/^Expires /)
  })
})
