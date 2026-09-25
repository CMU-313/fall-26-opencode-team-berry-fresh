import { createMemo, createSignal, onMount } from "solid-js"
import { useSync } from "../../context/sync"
import { useKV } from "../../context/kv"
import { DialogSelect, type DialogSelectOption } from "../../ui/dialog-select"
import type { TextPart } from "@opencode-ai/sdk/v2"
import { Locale } from "../../util/locale"
import { DialogMessage } from "./dialog-message"
import { useDialog } from "../../ui/dialog"
import { useToast } from "../../ui/toast"
import type { PromptInfo } from "../../component/prompt/history"
import { getBookmarks, toggleBookmark } from "./bookmarks"

export function DialogTimeline(props: {
  sessionID: string
  onMove: (messageID: string) => void
  setPrompt?: (prompt: PromptInfo) => void
}) {
  const sync = useSync()
  const kv = useKV()
  const dialog = useDialog()
  const toast = useToast()
  const [loading, setLoading] = createSignal(true)
  const [selectedID, setSelectedID] = createSignal<string>()

  onMount(() => {
    dialog.setSize("large")
    void sync.session
      .loadHistory(props.sessionID)
      .catch(() => toast.show({ variant: "error", message: "Failed to load older prompts" }))
      .finally(() => setLoading(false))
  })

  const options = createMemo((): DialogSelectOption<string>[] => {
    const messages = sync.data.message[props.sessionID] ?? []
    const saved = new Set(getBookmarks(kv, props.sessionID))
    const result = [] as DialogSelectOption<string>[]
    for (const message of messages) {
      if (message.role !== "user") continue
      const part = (sync.data.part[message.id] ?? []).find(
        (x) => x.type === "text" && !x.synthetic && !x.ignored,
      ) as TextPart
      if (!part) continue
      result.push({
        title: part.text.replace(/\n/g, " "),
        value: message.id,
        footer: saved.has(message.id)
          ? `Bookmarked · ${Locale.time(message.time.created)}`
          : Locale.time(message.time.created),
        onSelect: (dialog) => {
          dialog.replace(() => (
            <DialogMessage messageID={message.id} sessionID={props.sessionID} setPrompt={props.setPrompt} />
          ))
        },
      })
    }
    result.reverse()
    return result
  })

  return (
    <DialogSelect
      onMove={(option) => {
        setSelectedID(option.value)
        props.onMove(option.value)
      }}
      title="Timeline"
      options={options()}
      preserveSelection={true}
      actions={[
        {
          command: "bookmark.toggle",
          title: getBookmarks(kv, props.sessionID).includes(selectedID() ?? options()[0]?.value)
            ? "remove bookmark"
            : "add bookmark",
          onTrigger: (option) => toggleBookmark(kv, props.sessionID, option.value),
        },
      ]}
      emptyView={
        <box paddingLeft={4} paddingRight={4} paddingTop={1}>
          <text>{loading() ? "Loading older prompts..." : "No prompts found"}</text>
        </box>
      }
    />
  )
}
