/** @jsxImportSource @opentui/solid */
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import { InputRenderable } from "@opentui/core"
import { expect, test } from "bun:test"
import type { TextPart, UserMessage } from "@opencode-ai/sdk/v2"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { onCleanup, onMount, type JSX } from "solid-js"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import { TestTuiContexts } from "../../fixture/tui-environment"
import { createEventSource, createFetch, directory, json } from "../../fixture/tui-sdk"
import { tmpdir } from "../../fixture/fixture"
import { ArgsProvider } from "../../../src/context/args"
import { ClipboardProvider } from "../../../src/context/clipboard"
import { ExitProvider } from "../../../src/context/exit"
import { KVProvider, useKV } from "../../../src/context/kv"
import { PermissionProvider } from "../../../src/context/permission"
import { ProjectProvider } from "../../../src/context/project"
import { SDKProvider } from "../../../src/context/sdk"
import { SyncProvider, useSync } from "../../../src/context/sync"
import { ThemeProvider } from "../../../src/context/theme"
import { TuiConfigProvider } from "../../../src/config"
import { getBookmarks } from "../../../src/routes/session/bookmarks"
import { DialogBookmarks } from "../../../src/routes/session/dialog-bookmarks"
import { DialogTimeline } from "../../../src/routes/session/dialog-timeline"
import { OpencodeKeymapProvider, registerOpencodeKeymap } from "../../../src/keymap"
import { DialogProvider } from "../../../src/ui/dialog"
import { ToastProvider } from "../../../src/ui/toast"

const sessionID = "session-1"

function prompt(index: number, text: string) {
  const id = `message-${index}`
  const info: UserMessage = {
    id,
    sessionID,
    role: "user",
    time: { created: index },
    agent: "build",
    model: { providerID: "test", modelID: "test" },
  }
  const part: TextPart = {
    id: `part-${index}`,
    sessionID,
    messageID: id,
    type: "text",
    text,
  }
  return { info, parts: [part] }
}

const prompts = [prompt(1, "First saved prompt"), prompt(2, "Not bookmarked"), prompt(3, "Newest saved prompt")]

async function waitFor(check: () => boolean, timeout = 2_000) {
  const deadline = Date.now() + timeout
  while (!check()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for condition")
    await Bun.sleep(10)
  }
}

async function mount(input: {
  root: string
  bookmarks: string[]
  render: () => JSX.Element
  history?: typeof prompts
}) {
  const state = path.join(input.root, "state")
  await mkdir(state, { recursive: true })
  await Bun.write(path.join(state, "kv.json"), JSON.stringify({ [`session_bookmarks:${sessionID}`]: input.bookmarks }))

  const events = createEventSource()
  const history = input.history ?? prompts
  const calls = createFetch((url) => {
    if (url.pathname === `/session/${sessionID}`)
      return json({
        id: sessionID,
        projectID: "proj_test",
        directory,
        title: "Bookmark test",
        version: "1",
        time: { created: 0, updated: 0 },
      })
    if (url.pathname === `/session/${sessionID}/message`) return json(history)
    if (url.pathname === `/session/${sessionID}/todo` || url.pathname === `/session/${sessionID}/diff`) return json([])
    return undefined
  }, events)

  let kv!: ReturnType<typeof useKV>
  let sync!: ReturnType<typeof useSync>

  function Probe() {
    kv = useKV()
    sync = useSync()
    onMount(() => {
      sync.set(
        "message",
        sessionID,
        prompts.map((item) => item.info),
      )
      prompts.forEach((item) => sync.set("part", item.info.id, item.parts))
    })
    return input.render()
  }

  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    const config = createTuiResolvedConfig()
    onCleanup(registerOpencodeKeymap(keymap, renderer, config))

    return (
      <TestTuiContexts directory={input.root} paths={{ home: input.root, state, worktree: input.root }}>
        <ClipboardProvider value={{}}>
          <OpencodeKeymapProvider keymap={keymap}>
            <ArgsProvider>
              <KVProvider>
                <ToastProvider>
                  <TuiConfigProvider config={config}>
                    <SDKProvider url="http://test" directory={directory} fetch={calls.fetch} events={events.source}>
                      <PermissionProvider>
                        <ProjectProvider>
                          <ExitProvider exit={() => {}}>
                            <SyncProvider>
                              <ThemeProvider mode="dark" source={{ discover: async () => ({}) }}>
                                <DialogProvider>
                                  <Probe />
                                </DialogProvider>
                              </ThemeProvider>
                            </SyncProvider>
                          </ExitProvider>
                        </ProjectProvider>
                      </PermissionProvider>
                    </SDKProvider>
                  </TuiConfigProvider>
                </ToastProvider>
              </KVProvider>
            </ArgsProvider>
          </OpencodeKeymapProvider>
        </ClipboardProvider>
      </TestTuiContexts>
    )
  }

  const app = await testRender(() => <Harness />, { width: 100, height: 30, kittyKeyboard: true })
  await waitFor(() => kv?.ready === true && sync?.status === "complete")
  return { app, kv }
}

test("bookmark picker displays only saved prompts", async () => {
  await using tmp = await tmpdir()
  const mounted = await mount({
    root: tmp.path,
    bookmarks: ["message-1", "message-3"],
    render: () => <DialogBookmarks sessionID={sessionID} onSelect={() => {}} />,
  })

  try {
    await waitFor(() => mounted.app.captureCharFrame().includes("Newest saved prompt"))
    expect(mounted.app.captureCharFrame()).toContain("First saved prompt")
    expect(mounted.app.captureCharFrame()).not.toContain("Not bookmarked")
  } finally {
    mounted.app.renderer.destroy()
  }
})

test("bookmark picker filters saved prompts by search text", async () => {
  await using tmp = await tmpdir()
  const mounted = await mount({
    root: tmp.path,
    bookmarks: ["message-1", "message-3"],
    render: () => <DialogBookmarks sessionID={sessionID} onSelect={() => {}} />,
  })

  try {
    await waitFor(() => mounted.app.captureCharFrame().includes("Newest saved prompt"))
    await waitFor(() => mounted.app.renderer.currentFocusedEditor instanceof InputRenderable)
    "First".split("").forEach((key) => mounted.app.mockInput.pressKey(key))
    await waitFor(() => !mounted.app.captureCharFrame().includes("Newest saved prompt"))
    expect(mounted.app.captureCharFrame()).toContain("First saved prompt")
  } finally {
    mounted.app.renderer.destroy()
  }
})

test("bookmark picker selects the highlighted prompt", async () => {
  await using tmp = await tmpdir()
  const selected: string[] = []
  const mounted = await mount({
    root: tmp.path,
    bookmarks: ["message-1", "message-3"],
    render: () => <DialogBookmarks sessionID={sessionID} onSelect={(messageID) => selected.push(messageID)} />,
  })

  try {
    await waitFor(() => mounted.app.captureCharFrame().includes("Newest saved prompt"))
    mounted.app.mockInput.pressEnter()
    expect(selected).toEqual(["message-3"])
  } finally {
    mounted.app.renderer.destroy()
  }
})

test("bookmark picker removes the highlighted prompt with Ctrl+D", async () => {
  await using tmp = await tmpdir()
  const mounted = await mount({
    root: tmp.path,
    bookmarks: ["message-1", "message-3"],
    render: () => <DialogBookmarks sessionID={sessionID} onSelect={() => {}} />,
  })

  try {
    await waitFor(() => mounted.app.captureCharFrame().includes("Newest saved prompt"))
    mounted.app.mockInput.pressKey("d", { ctrl: true })
    await waitFor(() => !getBookmarks(mounted.kv, sessionID).includes("message-3"))
    expect(getBookmarks(mounted.kv, sessionID)).toEqual(["message-1"])
  } finally {
    mounted.app.renderer.destroy()
  }
})

test("timeline marks saved prompts as bookmarked", async () => {
  await using tmp = await tmpdir()
  const mounted = await mount({
    root: tmp.path,
    bookmarks: ["message-3"],
    render: () => <DialogTimeline sessionID={sessionID} onMove={() => {}} />,
  })

  try {
    await waitFor(() => mounted.app.captureCharFrame().includes("Newest saved prompt"))
    expect(mounted.app.captureCharFrame()).toContain("Bookmarked")
  } finally {
    mounted.app.renderer.destroy()
  }
})

test("timeline adds a bookmark to the highlighted prompt with Ctrl+D", async () => {
  await using tmp = await tmpdir()
  const mounted = await mount({
    root: tmp.path,
    bookmarks: ["message-1"],
    render: () => <DialogTimeline sessionID={sessionID} onMove={() => {}} />,
  })

  try {
    await waitFor(() => mounted.app.captureCharFrame().includes("Newest saved prompt"))
    mounted.app.mockInput.pressKey("d", { ctrl: true })
    await waitFor(() => getBookmarks(mounted.kv, sessionID).includes("message-3"))
    expect(getBookmarks(mounted.kv, sessionID)).toEqual(["message-1", "message-3"])
  } finally {
    mounted.app.renderer.destroy()
  }
})

test("timeline removes a bookmark from the highlighted prompt with Ctrl+D", async () => {
  await using tmp = await tmpdir()
  const mounted = await mount({
    root: tmp.path,
    bookmarks: ["message-1", "message-3"],
    render: () => <DialogTimeline sessionID={sessionID} onMove={() => {}} />,
  })

  try {
    await waitFor(() => mounted.app.captureCharFrame().includes("Newest saved prompt"))
    mounted.app.mockInput.pressKey("d", { ctrl: true })
    await waitFor(() => !getBookmarks(mounted.kv, sessionID).includes("message-3"))
    expect(getBookmarks(mounted.kv, sessionID)).toEqual(["message-1"])
  } finally {
    mounted.app.renderer.destroy()
  }
})

test("bookmark picker loads a saved prompt older than the initial message window", async () => {
  await using tmp = await tmpdir()
  const history = Array.from({ length: 151 }, (_, index) => prompt(index, `History prompt ${index}`))
  const mounted = await mount({
    root: tmp.path,
    bookmarks: ["message-0"],
    history,
    render: () => <DialogBookmarks sessionID={sessionID} onSelect={() => {}} />,
  })

  try {
    await waitFor(() => mounted.app.captureCharFrame().includes("History prompt 0"))
    expect(mounted.app.captureCharFrame()).not.toContain("Bookmark a prompt to find it here")
  } finally {
    mounted.app.renderer.destroy()
  }
})
