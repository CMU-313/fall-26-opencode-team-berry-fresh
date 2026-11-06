import type { ToastContext } from "../../ui/toast"
import { undoWithConflicts } from "./dialog-undo-conflict"

export async function undoPrompt(input: {
  request: Parameters<typeof undoWithConflicts>[0]
  choose: Parameters<typeof undoWithConflicts>[1]
  toast: Pick<ToastContext, "show">
  onReverted: () => void
}) {
  const reverted = await undoWithConflicts(input.request, input.choose).catch((error: unknown) => {
    input.toast.show({ message: error instanceof Error ? error.message : "Failed to undo prompt", variant: "error" })
    return false
  })
  if (!reverted) return false
  input.onReverted()
  input.toast.show({ message: "Reverted", variant: "success" })
  return true
}

export function messagesBeforeRevert<T extends { id: string }>(messages: readonly T[], messageID?: string) {
  if (!messageID) return messages
  const index = messages.findIndex((message) => message.id === messageID)
  return index === -1 ? messages : messages.slice(0, index)
}
