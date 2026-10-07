const requests = new Map<string, number[]>()

export function checkRateLimit(key: string, limit = 5, windowMs = 3600000): boolean {
  const now = Date.now()
  const timestamps = requests.get(key) ?? []

  const valid = timestamps.filter(ts => now - ts < windowMs)

  if (valid.length >= limit) {
    return false
  }

  valid.push(now)
  requests.set(key, valid)
  return true
}
