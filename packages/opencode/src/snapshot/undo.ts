export * as Undo from "./undo"

import { diffArrays } from "diff"
import { Schema } from "effect"

export const Conflict = Schema.Struct({
  file: Schema.String,
  action: Schema.Literals(["restore", "delete"]),
  token: Schema.String,
})
export const Decision = Schema.Struct({
  file: Schema.String,
  token: Schema.String,
  choice: Schema.Literals(["keep", "overwrite"]),
})
export class ConflictError extends Schema.TaggedErrorClass<ConflictError>()("UndoConflict", {
  conflicts: Schema.Array(Conflict),
}) {}

// Both edit sets use the agent's final contents as their common ancestor.
// Refuse ambiguous ranges instead of guessing which identical line was edited.
export function merge(expected: string, desired: string, current: string) {
  const lines = (value: string) => value.match(/[^\n]*\n|[^\n]+$/g) ?? []
  const edits = (value: string) => {
    let index = 0
    const result: { start: number; end: number; lines: string[] }[] = []
    for (const change of diffArrays(lines(expected), lines(value))) {
      if (!change.added && !change.removed) {
        index += change.value.length
        continue
      }
      const last = result.at(-1)
      if (last && last.end === index) {
        if (change.added) last.lines.push(...change.value)
        if (change.removed) last.end = index += change.value.length
        continue
      }
      result.push({
        start: index,
        end: change.removed ? index + change.value.length : index,
        lines: change.added ? change.value : [],
      })
      if (change.removed) index += change.value.length
    }
    return result
  }
  const agent = edits(desired)
  const manual = edits(current)
  if (
    agent.some((a) =>
      manual.some((b) =>
        a.start === a.end && b.start === b.end
          ? a.start === b.start
          : a.start === a.end
            ? b.start < a.start && a.start < b.end
            : b.start === b.end
              ? a.start < b.start && b.start < a.end
              : a.start < b.end && b.start < a.end,
      ),
    )
  )
    return undefined
  const result = lines(expected)
  for (const edit of [...agent, ...manual].sort((a, b) => b.start - a.start || b.end - a.end))
    result.splice(edit.start, edit.end - edit.start, ...edit.lines)
  return result.join("")
}
