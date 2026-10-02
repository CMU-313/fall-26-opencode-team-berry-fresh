/** @jsxImportSource @opentui/solid */
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import { describe, expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { onCleanup } from "solid-js"
import { tmpdir } from "../../../fixture/fixture"
import { createTuiResolvedConfig } from "../../../fixture/tui-runtime"
import { TestTuiContexts } from "../../../fixture/tui-environment"
import type { ToastContext } from "../../../../src/ui/toast"

// Renders the real /notifications dialog inside a real ToastProvider so tests can show toasts and read the screen
async function mount(root: string) {
  const state = path.join(root, "state")
  await mkdir(state, { recursive: true })
  await Bun.write(path.join(state, "kv.json"), "{}")

  const [
    { DialogProvider },
    { DialogNotifications },
    { KVProvider },
    { ThemeProvider },
    { TuiConfigProvider },
    { ToastProvider, useToast },
    { OpencodeKeymapProvider, registerOpencodeKeymap },
  ] = await Promise.all([
    import("../../../../src/ui/dialog"),
    import("../../../../src/component/dialog-notifications"),
    import("../../../../src/context/kv"),
    import("../../../../src/context/theme"),
    import("../../../../src/config"),
    import("../../../../src/ui/toast"),
    import("../../../../src/keymap"),
  ])

  const captured: { toast?: ToastContext } = {}

  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    const config = createTuiResolvedConfig()
    onCleanup(registerOpencodeKeymap(keymap, renderer, config))

    return (
      <TestTuiContexts directory={root} paths={{ home: root, state, worktree: root }}>
        <OpencodeKeymapProvider keymap={keymap}>
          <TuiConfigProvider config={config}>
            <KVProvider>
              <ThemeProvider mode="dark">
                <ToastProvider>
                  <DialogProvider>
                    {(() => {
                      captured.toast = useToast()
                      return <DialogNotifications />
                    })()}
                  </DialogProvider>
                </ToastProvider>
              </ThemeProvider>
            </KVProvider>
          </TuiConfigProvider>
        </OpencodeKeymapProvider>
      </TestTuiContexts>
    )
  }

  // Tall terminal so the dialog's scrollbox never clips the 5 visible entries
  const app = await testRender(() => <Harness />, { width: 80, height: 80 })
  // KV and theme providers load asynchronously before rendering their children
  const start = Date.now()
  while (!captured.toast) {
    if (Date.now() - start > 2000) throw new Error("timed out waiting for toast context")
    await Bun.sleep(10)
  }
  return { app, toast: captured.toast }
}

describe("notifications dialog (/notifications)", () => {
  // Toasts are titled "Toast 1" .. "Toast N" in the order shown, so "Toast N" is the newest.
  // Below the 5-item limit, every toast is listed; above it, only the 5 newest. Newest is always first.
  const cases = [
    { shown: 0, expected: [] },
    { shown: 3, expected: ["Toast 3", "Toast 2", "Toast 1"] },
    { shown: 7, expected: ["Toast 7", "Toast 6", "Toast 5", "Toast 4", "Toast 3"] },
  ]

  for (const item of cases) {
    test(`[dialog] after ${item.shown} toast(s), lists ${JSON.stringify(item.expected)}`, async () => {
      await using tmp = await tmpdir()
      const harness = await mount(tmp.path)

      try {
        Array.from({ length: item.shown }, (_, index) => index + 1).forEach((n) =>
          harness.toast.show({ variant: "success", title: `Toast ${n}`, message: `Message ${n}`, duration: 300_000 }),
        )
        await harness.app.renderOnce()
        const frame = harness.app.captureCharFrame()

        expect([...frame.matchAll(/Toast \d+/g)].map((match) => match[0])).toEqual(item.expected)
        expect(frame.includes("Nothing happened while you were away")).toBe(item.shown === 0)
      } finally {
        harness.toast.hide()
        harness.app.renderer.destroy()
      }
    })
  }
})
