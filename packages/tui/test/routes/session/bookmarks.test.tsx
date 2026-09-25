/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { onMount } from "solid-js"
import { KVProvider, useKV } from "../../../src/context/kv"
import { bookmarkedMessages, getBookmarks, toggleBookmark } from "../../../src/routes/session/bookmarks"
import { TestTuiContexts } from "../../fixture/tui-environment"

async function mount(state: string) {
  let kv!: ReturnType<typeof useKV>
  function Probe() {
    const current = useKV()
    onMount(() => {
      kv = current
    })
    return <box />
  }
  const app = await testRender(() => (
    <TestTuiContexts paths={{ state }}>
      <KVProvider>
        <Probe />
      </KVProvider>
    </TestTuiContexts>
  ))
  const deadline = Date.now() + 2_000
  while ((!kv || !kv.ready) && Date.now() < deadline) await Bun.sleep(10)
  expect(kv.ready).toBe(true)
  return { app, kv }
}

async function waitForSaved(state: string, sessionID: string, expected: string[]) {
  const deadline = Date.now() + 2_000
  while (Date.now() < deadline) {
    const saved = (await Bun.file(path.join(state, "kv.json")).json()) as Record<string, unknown>
    if (JSON.stringify(saved[`session_bookmarks:${sessionID}`]) === JSON.stringify(expected)) return
    await Bun.sleep(10)
  }
  throw new Error(`Timed out waiting for bookmarks in ${sessionID}`)
}

test("bookmarks persist per session and can be removed", async () => {
  const state = await mkdtemp(path.join(tmpdir(), "opencode-bookmarks-"))
  await Bun.write(
    path.join(state, "kv.json"),
    JSON.stringify({ "session_bookmarks:session-c": ["message-4", "message-4", null, ""] }),
  )
  const first = await mount(state)

  expect(getBookmarks(first.kv, "session-c")).toEqual(["message-4"])
  expect(toggleBookmark(first.kv, "session-a", "message-1")).toBe(true)
  expect(toggleBookmark(first.kv, "session-a", "message-2")).toBe(true)
  expect(toggleBookmark(first.kv, "session-b", "message-3")).toBe(true)
  expect(getBookmarks(first.kv, "session-a")).toEqual(["message-1", "message-2"])

  await waitForSaved(state, "session-b", ["message-3"])
  first.app.renderer.destroy()

  const second = await mount(state)
  expect(getBookmarks(second.kv, "session-a")).toEqual(["message-1", "message-2"])
  expect(getBookmarks(second.kv, "session-b")).toEqual(["message-3"])
  expect(toggleBookmark(second.kv, "session-a", "message-1")).toBe(false)
  expect(getBookmarks(second.kv, "session-a")).toEqual(["message-2"])
  await waitForSaved(state, "session-a", ["message-2"])
  second.app.renderer.destroy()
  await rm(state, { recursive: true, force: true })
})

test("bookmark lists follow message order and ignore removed messages", () => {
  const messages = [{ id: "message-1" }, { id: "message-2" }, { id: "message-3" }]
  expect(bookmarkedMessages(["message-3", "removed", "message-1"], messages)).toEqual([
    messages[0],
    messages[2],
  ])
})
