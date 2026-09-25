import { createMemo, onMount } from "solid-js"
import { useKV } from "../../context/kv"
import { useSync } from "../../context/sync"
import { useDialog, type DialogContext } from "../../ui/dialog"
import { DialogSelect, type DialogSelectOption } from "../../ui/dialog-select"
import { Locale } from "../../util/locale"
import { bookmarkedMessages, getBookmarks } from "./bookmarks"

export function DialogBookmarks(props: { sessionID: string; onSelect: (messageID: string) => void }) {
  const kv = useKV()
  const sync = useSync()
  const dialog = useDialog()

  onMount(() => dialog.setSize("large"))

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
      emptyView={
        <box paddingLeft={4} paddingRight={4} paddingTop={1}>
          <text>{options().length === 0 ? "Bookmark a prompt to find it here" : "No matching bookmarks"}</text>
        </box>
      }
    />
  )
}
