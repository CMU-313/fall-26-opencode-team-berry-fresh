import { expect, mock, test } from "bun:test"
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { createTestRenderer } from "@opentui/core/testing"
import { Effect } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Global } from "@opencode-ai/core/global"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"
import { createEventSource, createFetch, directory, json } from "./fixture/tui-sdk"
import { TextareaRenderable } from "@opentui/core"

test("SIGHUP clears title and disposes scoped resources once", async () => {
  const setup = await createTestRenderer({ width: 80, height: 24, useThread: false })
  const core = await import("@opentui/core")
  mock.module("@opentui/core", () => ({ ...core, createCliRenderer: async () => setup.renderer }))
  const titles: string[] = []
  const setTitle = setup.renderer.setTerminalTitle.bind(setup.renderer)
  setup.renderer.setTerminalTitle = (title) => {
    titles.push(title)
    setTitle(title)
  }
  const listeners = new Set(process.listeners("SIGHUP"))
  const events = createEventSource()
  const calls = createFetch()
  let started!: () => void
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })
  let disposes = 0

  try {
    const { run } = await import("../src/app")
    const task = Effect.runPromise(
      run({
        url: "http://test",
        directory,
        config: createTuiResolvedConfig({ plugin_enabled: {} }),
        fetch: calls.fetch,
        events: events.source,
        args: {},
        pluginHost: {
          async start() {
            started()
          },
          async dispose() {
            disposes++
          },
        },
      }).pipe(Effect.provide(AppNodeBuilder.build(Global.node))),
    )
    await ready
    process.emit("SIGHUP")
    await task

    expect(setup.renderer.isDestroyed).toBe(true)
    expect(titles.at(-1)).toBe("")
    expect(disposes).toBe(1)
    expect(process.listeners("SIGHUP").every((listener) => listeners.has(listener))).toBe(true)
  } finally {
    if (!setup.renderer.isDestroyed) setup.renderer.destroy()
    mock.restore()
  }
})

test("app.exit prints the session epilogue after scoped cleanup", async () => {
  const setup = await createTestRenderer({ width: 80, height: 24, useThread: false })
  const core = await import("@opentui/core")
  mock.module("@opentui/core", () => ({ ...core, createCliRenderer: async () => setup.renderer }))
  const events = createEventSource()
  const calls = createFetch((url) => {
    if (url.pathname === "/session")
      return json([
        {
          id: "dummy",
          title: "Demo session",
          slug: "dummy",
          projectID: "project",
          directory,
          version: "0.0.0-test",
          time: { created: 0, updated: 0 },
        },
      ])
  })
  const originalWrite = process.stdout.write.bind(process.stdout)
  let stdout = ""
  let api: TuiPluginApi | undefined
  let started!: () => void
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })

  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += String(chunk)
    return true
  }) as typeof process.stdout.write

  try {
    const { run } = await import("../src/app")
    const task = Effect.runPromise(
      run({
        url: "http://test",
        directory,
        config: createTuiResolvedConfig({ plugin_enabled: {} }),
        fetch: calls.fetch,
        events: events.source,
        args: { continue: true },
        pluginHost: {
          async start(input) {
            api = input.api
            started()
          },
          async dispose() {},
        },
      }).pipe(Effect.provide(AppNodeBuilder.build(Global.node))),
    )

    await ready
    await setup.renderOnce()
    await setup.renderOnce()
    api?.keymap.dispatchCommand("app.exit")
    await task

    expect(stdout).toContain("Demo session")
    expect(stdout).toContain("opencode -s dummy")
  } finally {
    process.stdout.write = originalWrite
    if (!setup.renderer.isDestroyed) setup.renderer.destroy()
    mock.restore()
  }
})

// Run the real command and paste handlers for every workspace fallback, capturing SDK submissions.
test.each([
  {
    name: "repository worktree",
    worktree: "/tmp/opencode",
    instance: directory,
    session: directory,
    root: "/tmp/opencode",
  },
  {
    // A root of "/" is not a usable repository hint; prefer the session's directory.
    name: "session directory",
    worktree: "/",
    instance: directory,
    session: "/tmp/selected-project",
    root: "/tmp/selected-project",
  },
  // Without a worktree or session directory, use the instance's working directory.
  { name: "instance directory", worktree: "", instance: directory, session: "", root: directory },
  // If all supplied directories are unavailable, retain the TUI launch directory.
  { name: "launch directory", worktree: "/", instance: "", session: "", root: process.cwd() },
])("/comment handles empty code, submits selections, and uses $name", async (context) => {
  const setup = await createTestRenderer({ width: 100, height: 30, useThread: false })
  const core = await import("@opentui/core")
  mock.module("@opentui/core", () => ({ ...core, createCliRenderer: async () => setup.renderer }))
  const events = createEventSource()
  const session = {
    id: "dummy",
    title: "Comment tests",
    slug: "dummy",
    projectID: "project",
    directory: context.session,
    version: "0.0.0-test",
    time: { created: 0, updated: 0 },
  }
  const provider = { id: "test", name: "Test", models: { model: { id: "model", name: "Test model", variants: {} } } }
  const calls = createFetch((url) => {
    if (url.pathname === "/path")
      return json({ home: "", state: "", config: "", worktree: context.worktree, directory: context.instance })
    if (url.pathname === "/agent") return json([{ name: "build", mode: "primary", permission: [] }])
    if (url.pathname === "/config/providers") return json({ providers: [provider], default: { test: "model" } })
    if (url.pathname === "/provider")
      return json({
        all: [provider],
        default: { test: "model" },
        connected: ["test"],
      })
    if (url.pathname === "/session") return json([session])
    if (url.pathname === "/session/dummy") return json(session)
    if (url.pathname.startsWith("/session/dummy/")) return json([])
  })
  const requests: { path: string; body: { parts?: { type: string; text?: string }[] } }[] = []
  let api: TuiPluginApi | undefined
  let disposeSlots = () => {}
  const { run } = await import("../src/app")
  const task = Effect.runPromise(
    run({
      url: "http://test",
      directory,
      config: createTuiResolvedConfig({ plugin_enabled: {} }),
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init)
        if (request.method === "POST") {
          requests.push({ path: new URL(request.url).pathname, body: await request.clone().json() })
          return json({})
        }
        return calls.fetch(input, init)
      }) as typeof fetch,
      events: events.source,
      args: { continue: true, model: "test/model" },
      pluginHost: {
        async start(input) {
          api = input.api
          disposeSlots = input.runtime.setupSlots(input.api).dispose
        },
        async dispose() {
          disposeSlots()
        },
      },
    }).pipe(Effect.provide(AppNodeBuilder.build(Global.node))),
  )

  try {
    await waitForComment(() =>
      Boolean(api?.state.ready && setup.renderer.currentFocusedEditor instanceof TextareaRenderable),
    )
    const textarea = setup.renderer.currentFocusedEditor
    if (!(textarea instanceof TextareaRenderable)) throw new Error("expected focused prompt textarea")

    // Select the command through the same autocomplete used by the interface.
    api?.keymap.dispatchCommand("prompt.clear")
    await setup.mockInput.typeText("/comment")
    await waitForComment(async () => {
      await setup.renderOnce()
      return setup.captureCharFrame().includes("Comment selected code")
    })
    expect(setup.captureCharFrame()).toContain("Comment selected code")
    await setup.mockInput.pressEnter()
    await setup.renderOnce()
    expect(setup.captureCharFrame()).toContain("Paste the code you want to comment.")
    expect(requests).toHaveLength(0)

    // Regression: blank comment pastes must show a warning instead of invoking clipboard fallback.
    await setup.mockInput.pasteBracketedText(" \t\r\n ")
    await setup.renderOnce()
    expect(setup.captureCharFrame()).toContain("No code pasted")
    expect(setup.captureCharFrame()).toContain("Paste the code you want to comment.")
    expect(requests).toHaveLength(0)
    expect(textarea.plainText).toBe("")

    // Rejecting an empty selection also leaves comment mode, without a submission.
    await setup.mockInput.pasteBracketedText("ordinary prompt after empty selection")
    await waitForComment(() => textarea.plainText === "ordinary prompt after empty selection")
    expect(requests).toHaveLength(0)
    api?.keymap.dispatchCommand("prompt.clear")

    // Cover LF, Windows CRLF, and CR-only selections while preserving meaningful whitespace.
    const snippets = [
      "const total = price * quantity",
      'def greet(name):\r\n    return f"Hello, {name}!"  \r\n',
      "func square(n int) int {\r\treturn n * n\r}",
    ]
    // Sequential pastes must each submit once, include the resolved root, and clear the prompt.
    await snippets.reduce(async (previous, code, index) => {
      await previous
      api?.keymap.dispatchCommand("prompt.comment")
      await setup.mockInput.pasteBracketedText(code)
      await waitForComment(() => requests.length === index + 1)
      expect(requests[index].path).toBe("/session/dummy/message")
      expect(requests[index].body.parts).toEqual([
        {
          type: "text",
          text: expect.stringContaining(
            `Selected code:\n\`\`\`\n${code.replace(/\r\n/g, "\n").replace(/\r/g, "\n")}\n\`\`\``,
          ),
        },
      ])
      expect(requests[index].body.parts?.[0].text).toContain(`Workspace root: ${JSON.stringify(context.root)}`)
      expect(requests[index].body.parts?.[0].text).toContain(
        "Use the commenting convention appropriate for the file's language.",
      )
      expect(requests[index].body.parts?.[0].text).toContain("Keep the comment concise and useful.")
      expect(textarea.plainText).toBe("")
    }, Promise.resolve())

    // Comment mode must apply only to the next paste.
    await setup.mockInput.pasteBracketedText("ordinary prompt")
    await waitForComment(() => textarea.plainText === "ordinary prompt")
    expect(textarea.plainText).toBe("ordinary prompt")
    expect(requests).toHaveLength(snippets.length)
    api?.keymap.dispatchCommand("prompt.clear")
  } finally {
    if (!setup.renderer.isDestroyed) setup.renderer.destroy()
    await task
    mock.restore()
  }
})

async function waitForComment(condition: () => boolean | Promise<boolean>) {
  const start = Date.now()
  while (!(await condition())) {
    if (Date.now() - start > 5000) throw new Error("timed out waiting for comment workflow")
    await Bun.sleep(10)
  }
}
