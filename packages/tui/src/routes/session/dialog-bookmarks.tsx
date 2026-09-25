import { createEffect, createMemo, createSignal, onMount } from "solid-js"
import { useKV } from "../../context/kv"
import { useSync } from "../../context/sync"
import { useDialog, type DialogContext } from "../../ui/dialog"
import { DialogSelect, type DialogSelectOption } from "../../ui/dialog-select"
import { Locale } from "../../util/locale"
import { useToast } from "../../ui/toast"
import { bookmarkedMessages, getBookmarks, toggleBookmark } from "./bookmarks"

export function DialogBookmarks(props: { sessionID: string; onSelect: (messageID: string) => void }) {
  const kv = useKV()
  const sync = useSync()
  const dialog = useDialog()
  const toast = useToast()
  const [loading, setLoading] = createSignal(false)

  onMount(() => dialog.setSize("large"))

  createEffect(() => {
    if (!kv.ready) return
    const saved = getBookmarks(kv, props.sessionID)
    const loaded = new Set((sync.data.message[props.sessionID] ?? []).map((message) => message.id))
    if (!saved.some((id) => !loaded.has(id))) return
    setLoading(true)
    void sync.session
      .loadHistory(props.sessionID)
      .catch(() => toast.show({ variant: "error", message: "Failed to load older bookmarks" }))
      .finally(() => setLoading(false))
  })

  const options = createMemo((): DialogSelectOption<string>[] =>
    bookmarkedMessages(getBookmarks(kv, props.sessionID), sync.data.message[props.sessionID] ?? [])
      .flatMap((message) => {
        if (message.role !== "user") return []
        const part = (sync.data.part[message.id] ?? []).find(
          (part) => part.type === "text" && !part.synthetic && !part.ignored,
        )
        if (!part || part.type !== "text") return []
        return [
          {
            title: part.text.replace(/\n/g, " "),
            value: message.id,
            footer: Locale.time(message.time.created),
            onSelect: (dialog: DialogContext) => {
              props.onSelect(message.id)
              dialog.clear()
            },
          },
        ]
      })
      .toReversed(),
  )

  return (
    <DialogSelect
      title="Bookmarks"
      options={options()}
      preserveSelection={true}
      actions={[
        {
          command: "bookmark.remove",
          title: "remove",
          onTrigger: (option) => toggleBookmark(kv, props.sessionID, option.value),
        },
      ]}
      emptyView={
        <box paddingLeft={4} paddingRight={4} paddingTop={1}>
          <text>
            {loading()
              ? "Loading older bookmarks..."
              : options().length === 0
                ? "Bookmark a prompt to find it here"
                : "No matching bookmarks"}
          </text>
        </box>
      }
    />
  )
}
