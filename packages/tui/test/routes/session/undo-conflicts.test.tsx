/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { testRender, useRenderer } from "@opentui/solid"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { onCleanup, onMount } from "solid-js"
import type { UndoConflictError } from "@opencode-ai/sdk/v2"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import { TestTuiContexts } from "../../fixture/tui-environment"
import { tmpdir } from "../../fixture/fixture"
import { ClipboardProvider } from "../../../src/context/clipboard"
import { KVProvider } from "../../../src/context/kv"
import { ThemeProvider } from "../../../src/context/theme"
import { TuiConfigProvider } from "../../../src/config"
import { OpencodeKeymapProvider, registerOpencodeKeymap } from "../../../src/keymap"
import { DialogProvider, useDialog } from "../../../src/ui/dialog"
import { ToastProvider } from "../../../src/ui/toast"
import { DialogUndoConflict, undoWithConflicts } from "../../../src/routes/session/dialog-undo-conflict"

async function waitFor(check: () => boolean) {
  const deadline = Date.now() + 2000
  while (!check()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for undo dialog")
    await Bun.sleep(10)
  }
}

// R1/R4: Conflicting edits require a keep/restore or keep/delete decision.
// UI tests cover the actual labels, safe default, destructive choice and Escape;
// generated session properties verify the corresponding filesystem outcomes.
for (const action of ["restore", "delete"] as const) {
  for (const choice of ["keep", "overwrite", "dismiss"] as const) {
    test(`undo ${action} conflict: ${choice}`, async () => {
      await using tmp = await tmpdir()
      let answer: string | undefined = "pending"
      function Probe() {
        const dialog = useDialog()
        onMount(() => {
          void DialogUndoConflict.show(dialog, { file: "example.txt", action, token: "version" }).then((value) => {
            answer = value
          })
        })
        return <box />
      }
      function Harness() {
        const renderer = useRenderer()
        const keymap = createDefaultOpenTuiKeymap(renderer)
        const config = createTuiResolvedConfig()
        onCleanup(registerOpencodeKeymap(keymap, renderer, config))
        return (
          <TestTuiContexts directory={tmp.path} paths={{ home: tmp.path, state: tmp.path, worktree: tmp.path }}>
            <ClipboardProvider value={{}}>
              <OpencodeKeymapProvider keymap={keymap}>
                <KVProvider>
                  <ToastProvider>
                    <TuiConfigProvider config={config}>
                      <ThemeProvider mode="dark" source={{ discover: async () => ({}) }}>
                        <DialogProvider>
                          <Probe />
                        </DialogProvider>
                      </ThemeProvider>
                    </TuiConfigProvider>
                  </ToastProvider>
                </KVProvider>
              </OpencodeKeymapProvider>
            </ClipboardProvider>
          </TestTuiContexts>
        )
      }
      const app = await testRender(() => <Harness />, { width: 100, height: 30, kittyKeyboard: true })
      try {
        await waitFor(() => app.captureCharFrame().includes("Undo conflict: example.txt"))
        expect(app.captureCharFrame()).toContain("Undo conflict: example.txt")
        expect(app.captureCharFrame()).toContain(action === "delete" ? "Keep file" : "Keep my edit")
        expect(app.captureCharFrame()).toContain(action === "delete" ? "Delete file" : "Restore original")
        if (choice === "dismiss") app.mockInput.pressEscape()
        if (choice === "overwrite") {
          app.mockInput.pressArrow("down")
          app.mockInput.pressEnter()
        }
        if (choice === "keep") app.mockInput.pressEnter()
        await waitFor(() => answer !== "pending")
        if (choice === "dismiss") expect(answer).toBeUndefined()
        if (choice !== "dismiss") expect(answer).toBe(choice)
      } finally {
        app.renderer.destroy()
      }
    })
  }
}

const conflict: UndoConflictError = {
  _tag: "UndoConflictError",
  conflicts: [{ file: "example.txt", token: "v1", action: "delete" }],
}

test("undo resubmits the selected decision with its content token", async () => {
  const requests: unknown[] = []
  const result = await undoWithConflicts(
    async (decisions) => {
      requests.push(decisions)
      return decisions.length ? {} : { error: conflict }
    },
    async () => "overwrite",
  )
  expect(result).toBe(true)
  expect(requests).toEqual([[], [{ file: "example.txt", token: "v1", choice: "overwrite" }]])
})

test("dismissing a conflict does not submit any decisions", async () => {
  let calls = 0
  expect(
    await undoWithConflicts(
      async () => {
        calls++
        return { error: conflict }
      },
      async () => undefined,
    ),
  ).toBe(false)
  expect(calls).toBe(1)
})

test("a stale decision is replaced after the user answers the fresh conflict", async () => {
  const tokens: string[] = []
  const requests: unknown[] = []
  expect(
    await undoWithConflicts(
      async (decisions) => {
        requests.push(decisions)
        if (requests.length > 2) return {}
        return { error: { ...conflict, conflicts: [{ ...conflict.conflicts[0], token: `v${requests.length}` }] } }
      },
      async (item) => {
        tokens.push(item.token)
        return "keep"
      },
    ),
  ).toBe(true)
  expect(tokens).toEqual(["v1", "v2"])
  expect(requests.at(-1)).toEqual([{ file: "example.txt", token: "v2", choice: "keep" }])
})
