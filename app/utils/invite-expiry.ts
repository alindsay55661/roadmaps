export const INVITE_EXPIRY_SECONDS = 60 * 60 * 24 * 7

export function getInviteExpiresAt(nowSeconds = Math.floor(Date.now() / 1000)) {
  return nowSeconds + INVITE_EXPIRY_SECONDS
}

export function isInviteExpired(expiresAt: number, nowSeconds = Math.floor(Date.now() / 1000)) {
  return expiresAt < nowSeconds
}

export function formatInviteExpiry(expiresAt: number) {
  if (isInviteExpired(expiresAt)) return 'Expired'

  return `Expires ${new Date(expiresAt * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`
}
