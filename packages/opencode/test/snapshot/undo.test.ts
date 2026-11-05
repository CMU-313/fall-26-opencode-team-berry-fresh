import { expect, test } from "bun:test"
import path from "path"
import { symlink } from "node:fs/promises"
import { Effect } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Snapshot } from "../../src/snapshot"
import { Undo } from "../../src/snapshot/undo"
import { provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([Snapshot.node, CrossSpawnSpawner.node])))

it.live(
  "a conflict leaves every file unchanged until all decisions are supplied",
  provideTmpdirInstance(
    (dir) =>
      Effect.gen(function* () {
        const snapshot = yield* Snapshot.Service
        const a = path.join(dir, "a.txt")
        const b = path.join(dir, "b.txt")
        yield* Effect.promise(() => Promise.all([Bun.write(a, "original a"), Bun.write(b, "original b")]))
        const before = yield* snapshot.track()
        yield* Effect.promise(() => Promise.all([Bun.write(a, "agent a"), Bun.write(b, "agent b")]))
        const after = yield* snapshot.track()
        yield* Effect.promise(() => Bun.write(b, "manual b"))
        const changes = [a, b].map((file) => ({ file, expected: after, desired: before }))
        const error = yield* snapshot.reconcile(changes).pipe(Effect.flip)
        expect(error).toBeInstanceOf(Undo.ConflictError)
        expect(yield* Effect.promise(() => Bun.file(a).text())).toBe("agent a")
        expect(yield* Effect.promise(() => Bun.file(b).text())).toBe("manual b")
        yield* snapshot.reconcile(
          changes,
          error.conflicts.map((item) => ({ ...item, choice: "keep" })),
        )
        expect(yield* Effect.promise(() => Bun.file(a).text())).toBe("original a")
        expect(yield* Effect.promise(() => Bun.file(b).text())).toBe("manual b")
      }),
    { git: true },
  ),
)

it.live(
  "undo refuses paths through symlinks and paths outside its worktree",
  provideTmpdirInstance(
    (dir) =>
      Effect.gen(function* () {
        const snapshot = yield* Snapshot.Service
        const file = path.join(dir, "target.txt")
        yield* Effect.promise(() => Bun.write(file, "original"))
        const before = yield* snapshot.track()
        yield* Effect.promise(() => Bun.write(file, "agent"))
        const after = yield* snapshot.track()
        yield* Effect.promise(() => symlink(file, path.join(dir, "link.txt")))
        const link = yield* snapshot
          .reconcile([{ file: path.join(dir, "link.txt"), expected: after, desired: before }])
          .pipe(Effect.exit)
        expect(link._tag).toBe("Failure")
        const outside = yield* snapshot
          .reconcile([{ file: path.join(dir, "..", "outside.txt"), expected: after, desired: before }])
          .pipe(Effect.exit)
        expect(outside._tag).toBe("Failure")
        expect(yield* Effect.promise(() => Bun.file(file).text())).toBe("agent")
      }),
    { git: true },
  ),
)

test("reverse merges preserve manual insertions, deletions, and final-newline changes", () => {
  expect(Undo.merge("agent\nb\n", "original\nb\n", "manual\nagent\nb\n")).toBe("manual\noriginal\nb\n")
  expect(Undo.merge("agent\nb\n", "original\nb\n", "agent\nmanual\nb\n")).toBe("original\nmanual\nb\n")
  expect(Undo.merge("agent\nb\nc\n", "original\nb\nc\n", "agent\nb\n")).toBe("original\nb\n")
  expect(Undo.merge("agent\nb\n", "original\nb\n", "agent\nb")).toBe("original\nb")
  expect(Undo.merge("agent\nb\n", "original\nb\n", "manual\nb\n")).toBeUndefined()
})
