import { describe, expect, test } from "bun:test"
import { FastCheck as fc } from "effect/testing"
import {
  createDialogSessionListQuery,
  loadDialogSessionList,
  orderByRecency,
} from "../../src/component/dialog-session-list"

// Fixed seed so Stryker runs see the same generated inputs every time.
fc.configureGlobal({ seed: 42 })

describe("dialog session list", () => {
  test("requests root sessions for the default browse list", () => {
    expect(createDialogSessionListQuery({ filter: { path: "packages/tui" } })).toEqual({
      roots: true,
      limit: 100,
      path: "packages/tui",
    })
  })

  test("requests root sessions for search results", () => {
    expect(createDialogSessionListQuery({ search: " deploy ", filter: { scope: "project" } })).toEqual({
      roots: true,
      limit: 30,
      search: "deploy",
      scope: "project",
    })
  })

  test("keeps the cache usable while the root request is pending", async () => {
    let resolve!: (result: { data: string[] }) => void
    const pending = loadDialogSessionList<string>({
      filter: {},
      list: () => new Promise((done) => (resolve = done)),
    })

    expect(await Promise.race([pending, Promise.resolve("pending")])).toBe("pending")
    resolve({ data: ["root"] })
    expect(await pending).toEqual(["root"])
  })

  test("falls back when the root request returns an error response", async () => {
    expect(await loadDialogSessionList({ filter: {}, list: async () => ({}) })).toBeUndefined()
  })

  test("falls back when the root request rejects", async () => {
    expect(
      await loadDialogSessionList({
        filter: {},
        list: () => Promise.reject(new Error("offline")),
      }),
    ).toBeUndefined()
  })

  // R1: Typing a title in /sessions searches all of the current project's sessions for it, not just the 100 most
  // recent shown by default.
  // Kind: invariant
  // Generators: non-blank titles with optional surrounding spaces, since users often type stray whitespace.
  test("R1: any typed title is searched across the current project", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((title) => title.trim() !== ""),
        fc.constantFrom("", " ", "  "),
        (title, pad) => {
          const query = createDialogSessionListQuery({ search: pad + title + pad, filter: { scope: "project" } })
          expect(query.search).toBe(title.trim())
          expect(query.scope).toBe("project")
        },
      ),
    )
  })

  // R2: By default, sessions are listed newest first, by when each was last active.
  // Kind: metamorphic
  // Generators: 1-20 unique update times so ordering is never a tie, 0-5 sub-agent sessions at any time (the cached
  // list the popup falls back to includes them), and any index to mark as newly active.
  test("R2: sessions are newest first, and the one used last moves to the top", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.nat(), { minLength: 1, maxLength: 20 }),
        fc.array(fc.nat(), { maxLength: 5 }),
        fc.nat(),
        (times, childTimes, pick) => {
          const sessions = times.map((updated, i) => ({ id: `s${i}`, time: { updated } }))
          // Sub-agent sessions belong to a root session and are never listed on their own.
          const children = childTimes.map((updated, i) => ({ id: `c${i}`, parentID: "s0", time: { updated } }))
          const before = orderByRecency([...sessions, ...children])
          expect(before).toEqual(sessions.toSorted((a, b) => b.time.updated - a.time.updated).map((s) => s.id))
          const active = sessions[pick % sessions.length]
          const after = orderByRecency([
            ...sessions.map((s) => (s === active ? { ...s, time: { updated: Math.max(...times) + 1 } } : s)),
            ...children,
          ])
          expect(after).toEqual([active.id, ...before.filter((id) => id !== active.id)])
        },
      ),
    )
  })

  // R3: /sessions lists the current project's 100 most recently active sessions, each exactly once, newest first.
  // Older sessions can be found by searching (R1).
  // Kind: model / oracle
  // Generators: 0-250 sessions, covering the empty list, the 100 default boundary, and the 250 in the acceptance test,
  // plus 0-20 sub-agent sessions that are newer than all of them.
  test("R3: the list shows the 100 newest sessions, each once, newest first", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 250 }), fc.integer({ min: 0, max: 20 }), async (count, childCount) => {
        const newestFirst = Array.from({ length: count }, (_, i) => ({ id: `s${i}`, time: { updated: count - i } }))
        const children = Array.from({ length: childCount }, (_, i) => ({
          id: `c${i}`,
          parentID: "s0",
          time: { updated: count + childCount - i },
        }))
        // The server returns the newest sessions, only root sessions when the query asks, up to the query's limit.
        const loaded = await loadDialogSessionList({
          filter: {},
          list: async (query) => ({
            data: [...children, ...newestFirst]
              .filter((s) => !query.roots || !("parentID" in s))
              .slice(0, query.limit),
          }),
        })
        // Oracle: the IDs of the 100 newest sessions, newest first.
        expect(orderByRecency(loaded ?? [])).toEqual(newestFirst.slice(0, 100).map((s) => s.id))
      }),
    )
  })

  // R3: Verify /sessions lists the 100 most recent sessions, each exactly once, newest first.
  // This property test ensures that the sessions list contains exactly 100 sessions when there are at least 100,
  // each with unique IDs, and ordered by recency (newest first).
  // Kind: invariant
  // Generators: session counts covering empty, partial, and full boundaries (0-150 sessions)
  test("opencode R3: sessions are limited to 100 newest, each unique, newest first", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 150 }), async (count) => {
        const sessions = Array.from({ length: count }, (_, i) => (
          { id: `session-${i}`, time: { updated: count - i } }
        ))
        const loaded = await loadDialogSessionList({
          filter: {},
          list: async (query) => ({
            data: sessions
              .filter((s) => !query.roots || !("parentID" in s))
              .slice(0, query.limit),
          }),
        })
        // Verify we have at most 100 sessions
        expect(loaded?.length).toBeLessThanOrEqual(100)
        // Verify all IDs are unique
        const ids = loaded?.map(s => s.id) || []
        expect(new Set(ids).size).toBe(ids.length)
        // Verify order is newest first (larger time.updated comes first)
        for (let i = 1; i < (loaded?.length || 0); i++) {
          expect(loaded![i-1].time.updated).toBeGreaterThanOrEqual(loaded![i].time.updated)
        }
        // When there are more than 100 sessions, verify we have exactly 100
        if (count > 100) {
          expect(loaded?.length).toBe(100)
        }
      }),
    )
  })

  // R3: Strengthened version of the opencode property above (agent failure case).
  // Kind: model / oracle
  // Generators: 0-150 sessions with shuffled unique update times, so sessions never arrive already sorted.
  test("opencode R3 (strengthened): the list shows the 100 newest sessions, newest first", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .integer({ min: 0, max: 150 })
          .chain((count) => fc.shuffledSubarray([...Array(count).keys()], { minLength: count, maxLength: count })),
        async (times) => {
          const sessions = times.map((updated, i) => ({ id: `session-${i}`, time: { updated } }))
          // Update times are 0 to count - 1, so the newest N sessions have times >= count - N.
          const newest = (n: number) => sessions.filter((s) => s.time.updated >= times.length - n)
          // The server returns the newest sessions up to the query's limit, in no particular order.
          const loaded = await loadDialogSessionList({ filter: {}, list: async (query) => ({ data: newest(query.limit) }) })
          expect(orderByRecency(loaded ?? [])).toEqual(
            newest(100)
              .toSorted((a, b) => b.time.updated - a.time.updated)
              .map((s) => s.id),
          )
        },
      ),
    )
  })

  // R4: If the session list fails to load, /sessions still opens and shows the sessions the app already has, without
  // crashing.
  // Kind: invariant
  // Generators: any search text, and either an error response or a rejection with any value, since failures from
  // the server are not limited to Error objects.
  test("R4: if loading fails, nothing crashes and old sessions still show", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), fc.anything(), fc.boolean(), async (search, reason, rejects) => {
        const loaded = await loadDialogSessionList({
          search,
          filter: {},
          list: () => (rejects ? Promise.reject(reason) : Promise.resolve({})),
        })
        // No list means the popup falls back to the sessions the app already has.
        expect(loaded).toBeUndefined()
      }),
    )
  })
})
