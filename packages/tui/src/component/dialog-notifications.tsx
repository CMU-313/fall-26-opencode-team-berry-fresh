// Visual specifications for away notifications dialog box
import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { For, Show } from "solid-js"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { useToast } from "../ui/toast"

export function DialogNotifications() {
  const { theme } = useTheme()
  const dialog = useDialog()
  const toast = useToast()
  const dimensions = useTerminalDimensions()
  // Same cap as DialogSelect: the dialog sits a quarter of the way down, so keep the list on screen and scroll it
  const maxHeight = () => Math.max(3, Math.floor(dimensions().height / 2) - 6)

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Notifications while away
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <Show
        when={toast.history.length > 0}
        fallback={<text fg={theme.textMuted}>Nothing happened while you were away</text>}
      >
        <scrollbox
          maxHeight={maxHeight()}
          verticalScrollbarOptions={{
            paddingLeft: 1,
            trackOptions: { backgroundColor: theme.backgroundElement, foregroundColor: theme.border },
          }}
        >
          <box gap={1}>
            <For each={toast.history}>
              {(item) => (
                <box>
                  <text fg={theme.textMuted}>{new Date(item.time).toLocaleTimeString()}</text>
                  <Show when={item.title}>
                    <text fg={theme.text} attributes={TextAttributes.BOLD} wrapMode="word">
                      {item.title}
                    </text>
                  </Show>
                  <text fg={theme.text} wrapMode="word">
                    {item.message}
                  </text>
                </box>
              )}
            </For>
          </box>
        </scrollbox>
      </Show>
    </box>
  )
}
