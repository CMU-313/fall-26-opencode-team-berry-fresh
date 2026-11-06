import type { SessionRevertData, SessionRevertError, UndoConflictError } from "@opencode-ai/sdk/v2"
import { DialogSelect } from "../../ui/dialog-select"
import type { DialogContext } from "../../ui/dialog"

type Decision = NonNullable<NonNullable<SessionRevertData["body"]>["decisions"]>[number]
type Conflict = UndoConflictError["conflicts"][number]

export function DialogUndoConflict(props: { conflict: Conflict; onSelect: (choice: Decision["choice"]) => void }) {
  return (
    <DialogSelect<Decision["choice"]>
      title={`Undo conflict: ${props.conflict.file}`}
      skipFilter
      current="keep"
      options={[
        {
          title: props.conflict.action === "delete" ? "Keep file" : "Keep my edit",
          value: "keep",
          description: "Preserve your latest contents",
        },
        {
          title: props.conflict.action === "delete" ? "Delete file" : "Restore original",
          value: "overwrite",
          description:
            props.conflict.action === "delete"
              ? "Permanently discard this new file and its manual edits"
              : "Discard overlapping manual edits and restore pre-agent contents",
        },
      ]}
      onSelect={(option) => props.onSelect(option.value)}
    />
  )
}

DialogUndoConflict.show = (dialog: DialogContext, conflict: Conflict) =>
  new Promise<Decision["choice"] | undefined>((resolve) => {
    dialog.replace(
      () => (
        <DialogUndoConflict
          conflict={conflict}
          onSelect={(choice) => {
            resolve(choice)
            dialog.clear()
          }}
        />
      ),
      () => resolve(undefined),
    )
  })

// Only send decisions after all shown conflicts have been answered. Dismissal
// cancels undo; stale content tokens cause the server to return fresh conflicts.
export async function undoWithConflicts(
  request: (decisions: Decision[]) => Promise<{ error?: SessionRevertError }>,
  choose: (conflict: Conflict) => Promise<Decision["choice"] | undefined>,
) {
  const decisions = new Map<string, Decision>()
  while (true) {
    const result = await request(Array.from(decisions.values()))
    if (!result.error) return true
    if (!("_tag" in result.error) || result.error._tag !== "UndoConflictError")
      throw new Error("message" in result.error ? String(result.error.message) : "Failed to undo prompt")
    for (const conflict of result.error.conflicts) {
      const choice = await choose(conflict)
      if (!choice) return false
      decisions.set(conflict.file, { file: conflict.file, token: conflict.token, choice })
    }
  }
}
