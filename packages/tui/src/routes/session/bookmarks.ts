import type { useKV } from "../../context/kv"

type KV = ReturnType<typeof useKV>

export function getBookmarks(kv: KV, sessionID: string) {
  const value: unknown = kv.get(`session_bookmarks:${sessionID}`)
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0))]
}

export function toggleBookmark(kv: KV, sessionID: string, messageID: string) {
  if (!kv.ready) return
  const ids = getBookmarks(kv, sessionID)
  const saved = ids.includes(messageID)
  kv.set(`session_bookmarks:${sessionID}`, saved ? ids.filter((id) => id !== messageID) : [...ids, messageID])
  return !saved
}

export function bookmarkedMessages<T extends { id: string }>(ids: readonly string[], messages: readonly T[]) {
  const saved = new Set(ids)
  return messages.filter((message) => saved.has(message.id))
}
