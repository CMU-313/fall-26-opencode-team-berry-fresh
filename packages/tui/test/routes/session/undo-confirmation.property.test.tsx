/** @jsxImportSource @opentui/solid */
import { undoTestRoot } from "../../fixture/undo-test-environment"
import { expect, test } from "bun:test"
import fc from "fast-check"
import { testRender } from "@opentui/solid"
import { createSignal, For } from "solid-js"
import { Schema } from "effect"
import { createInterface } from "node:readline"
import { Readable } from "node:stream"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { tmpdir } from "../../fixture/fixture"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import { TestTuiContexts } from "../../fixture/tui-environment"
import { KVProvider } from "../../../src/context/kv"
import { ThemeProvider } from "../../../src/context/theme"
import { TuiConfigProvider } from "../../../src/config"
import { Toast, ToastProvider, useToast } from "../../../src/ui/toast"
import { messagesBeforeRevert, undoPrompt } from "../../../src/routes/session/undo"
import { Reply } from "../../../../opencode/test/fixture/undo-confirmation-contract"

// Always run both successful delivery types for every generated input, plus
// failure and cancellation. Bound real Git fixture sizes; explicit empty,
// Unicode, multiline and final-newline contents reach snapshot boundaries.
// Prompt characters exclude "Reverted" so the success-text assertion cannot
// accidentally match the user's own prompt.
const scenario = fc.record({
  prompt: fc
    .array(fc.constantFrom("a", "Z", "0", " ", "λ", "🍓"), { minLength: 1, maxLength: 30 })
    .map((chars) => `Prompt: ${chars.join("")}`),
  contents: fc.array(fc.oneof(fc.constantFrom("", "λ🍓", "line\n", "first\nlast"), fc.string({ maxLength: 64 })), {
    minLength: 1,
    maxLength: 3,
  }),
})

async function waitFor(check: () => boolean) {
  const deadline = Date.now() + 3000
  while (!check()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for undo confirmation UI")
    await Bun.sleep(10)
  }
}

// R5: /undo must display a confirmation message when a prompt is reverted,
// regardless of whether files were modified.
// Kind: Invariant
// For every input, confirmation follows actual restoration/transcript reversal;
// a pending, failed, or dismissed undo must not display success.
test("R5: successful undo visibly confirms both file-modifying and read-only prompts", async () => {
  await fc.assert(
    fc.asyncProperty(scenario, async (value) => {
      await using tmp = await tmpdir()
      await Bun.write(path.join(tmp.path, "kv.json"), "{}")
      const child = Bun.spawn([process.execPath, "run", "--conditions=browser", "test/fixture/undo-confirmation.ts"], {
        cwd: fileURLToPath(new URL("../../../../opencode", import.meta.url)),
        env: {
          ...process.env,
          TMPDIR: tmp.path,
          OPENCODE_MODELS_PATH: fileURLToPath(
            new URL("../../../../opencode/test/tool/fixtures/models-api.json", import.meta.url),
          ),
        },
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      })
      const errors = new Response(child.stderr).text()
      // Bun and Node declare different stream interfaces for this native adapter.
      const lines = createInterface({
        input: Readable.fromWeb(child.stdout as unknown as Parameters<typeof Readable.fromWeb>[0]),
      })
      const iterator = lines[Symbol.asyncIterator]()
      const read = async () => {
        const timeout = setTimeout(() => child.kill(), 20_000)
        try {
          while (true) {
            const line = await iterator.next()
            if (line.done) throw new Error(`Undo fixture exited: ${await errors}`)
            if (line.value.startsWith("@@undo:"))
              return Schema.decodeUnknownSync(Schema.fromJsonString(Reply))(line.value.slice(7))
          }
        } finally {
          clearTimeout(timeout)
        }
      }
      try {
        for (const mode of ["modified", "read-only", "failure", "cancel"] as const) {
          child.stdin.write(
            JSON.stringify({
              ...value,
              mode: mode === "failure" ? "read-only" : mode === "cancel" ? "conflict" : mode,
            }) + "\n",
          )
          const ready = await read()
          if (ready.type !== "ready") throw new Error("Expected prepared session")
          // The server fixture must live inside this test-owned temporary root.
          expect(path.relative(tmp.path, ready.directory).startsWith("..")).toBe(false)
          const boundary = createSignal<string>()
          const active = () => messagesBeforeRevert(ready.messages, boundary[0]())
          let toast: ReturnType<typeof useToast> | undefined
          function Probe() {
            toast = useToast()
            return (
              <>
                <For each={active()}>{(message) => <text>{message.text}</text>}</For>
                <Toast />
              </>
            )
          }
          const app = await testRender(
            () => (
              <TestTuiContexts directory={tmp.path} paths={{ home: undoTestRoot, state: tmp.path, worktree: tmp.path }}>
                <KVProvider>
                  <ToastProvider>
                    <TuiConfigProvider config={createTuiResolvedConfig()}>
                      <ThemeProvider mode="dark" source={{ discover: async () => ({}) }}>
                        <Probe />
                      </ThemeProvider>
                    </TuiConfigProvider>
                  </ToastProvider>
                </KVProvider>
              </TestTuiContexts>
            ),
            { width: 100, height: 30 },
          )
          try {
            await waitFor(() => toast !== undefined && app.captureCharFrame().includes("Prompt:"))
            const started = Promise.withResolvers<void>()
            const release = Promise.withResolvers<void>()
            let completed = false
            const pending = undoPrompt({
              request: async () => {
                started.resolve()
                await release.promise
                if (mode === "failure") throw new Error("Simulated network failure")
                child.stdin.write("undo\n")
                const result = await read()
                if (result.type !== "result") throw new Error("Expected undo response")
                if (!result.error) {
                  // A success response must arrive only after the real service
                  // restores every file; no replacement undo logic lives here.
                  for (const [i, original] of value.contents.entries())
                    expect(await Bun.file(path.join(ready.directory, `file-${i}.txt`)).text()).toBe(original)
                  expect(result.messageID).toBe(ready.promptID)
                  boundary[1](result.messageID)
                  completed = true
                }
                return { error: result.error }
              },
              choose: async () => undefined,
              toast: toast!,
              onReverted: () => expect(completed).toBe(true),
            })
            await started.promise
            await app.renderOnce()
            expect(toast!.history.some((item) => item.message === "Reverted")).toBe(false)
            expect(app.captureCharFrame()).not.toContain("Reverted")
            expect(active().some((message) => message.id === ready.promptID)).toBe(true)
            release.resolve()
            const success = await pending
            if (mode === "modified" || mode === "read-only") {
              expect(success).toBe(true)
              await waitFor(() => app.captureCharFrame().includes("Reverted"))
              expect(toast!.currentToast?.variant).toBe("success")
              expect(toast!.history.filter((item) => item.message === "Reverted")).toHaveLength(1)
              expect(active().some((message) => message.id === ready.promptID)).toBe(false)
              expect(app.captureCharFrame()).not.toContain("Prompt:")
              expect(app.captureCharFrame()).toContain("Earlier prompt")
            }
            if (mode === "failure" || mode === "cancel") {
              expect(success).toBe(false)
              await app.renderOnce()
              expect(toast!.history.some((item) => item.message === "Reverted")).toBe(false)
              expect(app.captureCharFrame()).not.toContain("Reverted")
              expect(active().some((message) => message.id === ready.promptID)).toBe(true)
              for (const [i, original] of value.contents.entries())
                expect(await Bun.file(path.join(ready.directory, `file-${i}.txt`)).text()).toBe(
                  mode === "cancel" ? `${i === 0 ? "manual" : "agent"}:${original}` : original,
                )
            }
          } finally {
            toast?.hide()
            app.renderer.destroy()
            child.stdin.write("dispose\n")
            expect((await read()).type).toBe("disposed")
          }
        }
        child.stdin.end()
        expect(await child.exited).toBe(0)
      } finally {
        lines.close()
        child.kill()
        await child.exited
      }
    }),
    { numRuns: 25 },
  )
}, 180_000)
