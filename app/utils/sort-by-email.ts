export function compareEmails(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: 'base' })
}

export function sortByEmail<T extends { email: string }>(items: T[]) {
  return [...items].sort((a, b) => compareEmails(a.email, b.email))
}
