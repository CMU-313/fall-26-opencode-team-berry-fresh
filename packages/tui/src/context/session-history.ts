import type { Message, Part } from "@opencode-ai/sdk/v2"

type Entry = { info: Message; parts: Part[] }

export function mergeSessionHistory(current: Entry[], history: Entry[]) {
  const loaded = new Map(current.map((entry) => [entry.info.id, entry]))
  const merged = history.map((entry) => {
    const existing = loaded.get(entry.info.id)
    if (!existing) return entry
    loaded.delete(entry.info.id)
    const parts = new Map(entry.parts.map((part) => [part.id, part]))
    for (const part of existing.parts) parts.set(part.id, part)
    return { info: existing.info, parts: [...parts.values()] }
  })
  return [...merged, ...loaded.values()].sort(
    (a, b) => a.info.time.created - b.info.time.created || a.info.id.localeCompare(b.info.id),
  )
}
