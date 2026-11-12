import { expect, test } from "bun:test"
import fc from "fast-check"
import path from "path"
import { Effect } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { Session } from "@/session/session"
import { SessionRevert } from "../../src/session/revert"
import { Undo } from "../../src/snapshot/undo"
import { Snapshot } from "../../src/snapshot"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { provideTmpdirInstance } from "../fixture/fixture"

const layer = LayerNode.compile(
  LayerNode.group([Session.node, SessionRevert.node, Snapshot.node, SessionProjector.node, CrossSpawnSpawner.node]),
)

const user = Effect.fn("test.user")(function* (sessionID: SessionID, agent = "default") {
  const session = yield* Session.Service
  return yield* session.updateMessage({
    id: MessageID.ascending(),
    role: "user" as const,
    sessionID,
    agent,
    model: { providerID: ProviderV2.ID.make("openai"), modelID: ModelV2.ID.make("gpt-4") },
    time: { created: Date.now() },
  })
})

const assistant = Effect.fn("test.assistant")(function* (sessionID: SessionID, parentID: MessageID, dir: string) {
  const session = yield* Session.Service
  return yield* session.updateMessage({
    id: MessageID.ascending(),
    role: "assistant" as const,
    sessionID,
    mode: "default",
    agent: "default",
    path: { cwd: dir, root: dir },
    cost: 0,
    tokens: { output: 0, input: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    modelID: ModelV2.ID.make("gpt-4"),
    providerID: ProviderV2.ID.make("openai"),
    parentID,
    time: { created: Date.now() },
    finish: "end_turn",
  })
})

// Bound sizes for real Git fixtures. Explicit empty, Unicode, and newline cases
// complement random text; distinct line prefixes guarantee meaningful edits.
const content = fc.oneof(fc.constantFrom("", "λ🍓", "a\n", "a\nb"), fc.string({ maxLength: 80 }))
const filename = fc.constantFrom("file.txt", "nested/file.txt", "file with spaces.txt")
const input = fc.record({ content, filename, position: fc.integer({ min: 0, max: 9 }) })

const run = (
  mode: "R1" | "R2" | "R4" | "R6",
  value: { content: string; filename: string; position: number },
  manual: false | "keep" | "overwrite" | "stale" = false,
) =>
  provideTmpdirInstance(
    (dir) =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const snapshot = yield* Snapshot.Service
        const revert = yield* SessionRevert.Service
        const file = path.join(dir, value.filename)
        // Ten distinct lines guarantee non-overlap, including adjacent and edge edits.
        const lines = Array.from({ length: 10 }, (_, i) => `${i}:${JSON.stringify(value.content)}`)
        const original = mode === "R2" ? lines.join("\n") : value.content
        if (mode !== "R4") yield* Effect.promise(() => Bun.write(file, original))
        if (mode === "R6") {
          yield* Effect.promise(async () => {
            await Bun.$`git -C ${dir} add --all`.quiet()
            await Bun.$`git -C ${dir} -c user.name=Test -c user.email=test@example.com commit -m baseline`.quiet()
            expect((await Bun.$`git -C ${dir} status --porcelain`.quiet()).stdout.toString()).toBe("")
          })
        }
        const session = yield* sessions.create({})
        const prompt = yield* user(session.id)
        yield* sessions.updatePart({
          id: PartID.ascending(),
          sessionID: session.id,
          messageID: prompt.id,
          type: "text",
          text: "Edit file",
        })
        const reply = yield* assistant(session.id, prompt.id, dir)
        const before = yield* snapshot.track()
        if (!before) throw new Error("Snapshot required")
        const changed =
          mode === "R2"
            ? lines.map((line, i) => (i === value.position ? `agent:${line}` : line)).join("\n")
            : mode === "R4"
              ? original
              : `agent:${original}`
        yield* Effect.promise(() => Bun.write(file, changed))
        const after = yield* snapshot.track()
        const patch = yield* snapshot.patch(before)
        expect(patch.files.length).toBeGreaterThan(0)
        yield* sessions.updatePart({
          id: PartID.ascending(),
          sessionID: session.id,
          messageID: reply.id,
          type: "patch",
          hash: patch.hash,
          after,
          files: patch.files,
        })
        const expected =
          mode === "R2"
            ? lines.map((line, i) => (i === (value.position + 1) % 10 ? `manual:${line}` : line)).join("\n")
            : `manual:${changed}`
        if (mode === "R2" || manual)
          yield* Effect.promise(() =>
            Bun.write(
              file,
              mode === "R2"
                ? expected
                    .split("\n")
                    .map((line, i) => (i === value.position ? `agent:${line}` : line))
                    .join("\n")
                : expected,
            ),
          )
        if (manual) {
          const conflict = yield* revert
            .revert({ sessionID: session.id, messageID: prompt.id })
            .pipe(
              Effect.match({
                onSuccess: () => undefined,
                onFailure: (error) => (error instanceof Undo.ConflictError ? error : undefined),
              }),
            )
          expect(conflict).toBeDefined()
          expect(conflict!.conflicts).toHaveLength(1)
          expect(conflict!.conflicts[0].file).toBe(file)
          expect(conflict!.conflicts[0].action).toBe(mode === "R4" ? "delete" : "restore")
          expect(yield* Effect.promise(() => Bun.file(file).text())).toBe(expected)
          expect((yield* sessions.get(session.id)).revert).toBeUndefined()
          if (manual === "stale") {
            yield* Effect.promise(() => Bun.write(file, `later:${expected}`))
            const rejected = yield* revert
              .revert({
                sessionID: session.id,
                messageID: prompt.id,
                decisions: conflict!.conflicts.map((item) => ({ ...item, choice: "overwrite" as const })),
              })
              .pipe(Effect.flip)
            expect(rejected).toBeInstanceOf(Undo.ConflictError)
            expect(yield* Effect.promise(() => Bun.file(file).text())).toBe(`later:${expected}`)
            return
          }
          yield* revert.revert({
            sessionID: session.id,
            messageID: prompt.id,
            decisions: conflict!.conflicts.map((item) => ({ ...item, choice: manual })),
          })
        }
        if (!manual) yield* revert.revert({ sessionID: session.id, messageID: prompt.id })
        if (mode === "R4" && manual !== "keep") {
          expect(yield* Effect.promise(() => Bun.file(file).exists())).toBe(false)
          return
        }
        expect(yield* Effect.promise(() => Bun.file(file).text())).toBe(
          mode === "R2" || manual === "keep" ? expected : original,
        )
        if (mode === "R6")
          yield* Effect.promise(async () => {
            expect((await Bun.$`git -C ${dir} diff -- ${value.filename}`.quiet()).stdout.toString()).toBe("")
            expect((await Bun.$`git -C ${dir} status --porcelain`.quiet()).stdout.toString()).toBe("")
          })
      }),
    { git: true },
  ).pipe(Effect.scoped, Effect.provide(layer), Effect.runPromise)

// R1: /undo should revert modifications made by the previous agent prompt to existing files, preserving non-overlapping subsequent manual edits and requiring permission before overwriting overlapping manual edits.
// Kind: Round-trip and invariant
// R3: /undo must detect overlapping manual and agent edits and avoid overwriting user changes without user’s permission
// Kind: Invariant
test("R1: undo acceptance property", async () => {
  await fc.assert(
    fc.asyncProperty(input, async (value) => {
      await run("R1", value)
      // R1 also requires preserving non-overlapping manual edits.
      await run("R2", value)
      await run("R1", value, "keep")
      await run("R1", value, "overwrite")
      await run("R1", value, "stale")
    }),
    { seed: 42, numRuns: 25 },
  )
}, 300_000)

// R2: /undo should preserve non-overlapping manual edits made after the agent’s changes
// Kind: Invariant
test("R2: undo acceptance property", async () => {
  await fc.assert(
    fc.asyncProperty(input, async (value) => {
      await run("R2", value)
    }),
    { seed: 42, numRuns: 25 },
  )
}, 300_000)

// R4: /undo must delete new files created by the previous agent prompt if they have not subsequently been manually modified. If a new file has subsequent manual modifications, /undo must preserve it unless the user explicitly approves deletion.
// Kind: Round-trip and invariant
test("R4: undo acceptance property", async () => {
  await fc.assert(
    fc.asyncProperty(input, async (value) => {
      await run("R4", value)
      await run("R4", value, "keep")
      await run("R4", value, "overwrite")
      await run("R4", value, "stale")
    }),
    { seed: 42, numRuns: 25 },
  )
}, 300_000)

// R6: When no subsequent manual edits have occurred, /undo must restore agent-modified file contents to their pre-prompt state, verifiable through file comparison or Git. When subsequent manual edits exist, preservation and conflict handling follow R2 and R3.
// Kind: Model / oracle
test("R6: undo acceptance property", async () => {
  await fc.assert(
    fc.asyncProperty(input, async (value) => {
      await run("R6", value)
    }),
    { seed: 42, numRuns: 25 },
  )
}, 300_000)
