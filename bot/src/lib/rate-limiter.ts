interface RateEntry {
  count: number
  windowStart: number
}

const limits = new Map<string, RateEntry>()

// Default limits per command (requests per 60 seconds)
const COMMAND_LIMITS: Record<string, number> = {
  start: 2,
  challenge: 5,
  accept: 5,
  balance: 15,
  deposit: 15,
  open: 10,
  history: 10,
  withdraw: 3,
  help: 15,
}

const WINDOW_MS = 60_000

export function checkRateLimit(userId: number, command: string): boolean {
  const key = `${userId}:${command}`
  const maxRequests = COMMAND_LIMITS[command] || 10
  const now = Date.now()

  const entry = limits.get(key)
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    limits.set(key, { count: 1, windowStart: now })
    return true
  }

  if (entry.count >= maxRequests) {
    return false
  }

  entry.count++
  return true
}
