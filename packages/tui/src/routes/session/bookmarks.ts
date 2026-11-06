import type { useKV } from "../../context/kv"

type KV = Pick<ReturnType<typeof useKV>, "ready" | "get" | "set">

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
  const messagesByID = new Map(messages.map((message) => [message.id, message]))
  return [...new Set(ids)].flatMap((id) => {
    const message = messagesByID.get(id)
    return message ? [message] : []
  })
}
