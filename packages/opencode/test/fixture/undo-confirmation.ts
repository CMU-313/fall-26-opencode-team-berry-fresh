// Run only in a child process with XDG paths and TMPDIR inside the UI test's
// temporary directory. No LLM or network server is needed for session undo.
import { createInterface } from "node:readline"
import path from "node:path"
import { Effect, Schema } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { Session } from "../../src/session/session"
import { SessionRevert } from "../../src/session/revert"
import { Snapshot } from "../../src/snapshot"
import { Undo } from "../../src/snapshot/undo"
import { MessageID, PartID } from "../../src/session/schema"
import { provideTmpdirInstance } from "./fixture"
import { Setup, Reply } from "./undo-confirmation-contract"

const lines = createInterface({ input: process.stdin })[Symbol.asyncIterator]()
const send = (reply: typeof Reply.Type) => console.log(`@@undo:${JSON.stringify(reply)}`)
const layer = LayerNode.compile(
  LayerNode.group([Session.node, SessionRevert.node, Snapshot.node, SessionProjector.node, CrossSpawnSpawner.node]),
)

while (true) {
  const line = await lines.next()
  if (line.done) break
  const setup = Schema.decodeUnknownSync(Schema.fromJsonString(Setup))(line.value)
  await provideTmpdirInstance(
    (dir) =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const snapshot = yield* Snapshot.Service
        const revert = yield* SessionRevert.Service
        const session = yield* sessions.create({})
        const previous = yield* sessions.updateMessage({
          id: MessageID.ascending(),
          role: "user",
          sessionID: session.id,
          agent: "default",
          model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
          time: { created: Date.now() },
        })
        const prompt = yield* sessions.updateMessage({ ...previous, id: MessageID.ascending() })
        yield* sessions.updatePart({
          id: PartID.ascending(),
          messageID: prompt.id,
          sessionID: session.id,
          type: "text",
          text: setup.prompt,
        })
        const reply = yield* sessions.updateMessage({
          id: MessageID.ascending(),
          role: "assistant",
          sessionID: session.id,
          mode: "default",
          agent: "default",
          path: { cwd: dir, root: dir },
          parentID: prompt.id,
          providerID: ProviderV2.ID.make("test"),
          modelID: ModelV2.ID.make("test"),
          cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          time: { created: Date.now() },
          finish: "end_turn",
        })
        yield* Effect.promise(() =>
          Promise.all(setup.contents.map((text, i) => Bun.write(path.join(dir, `file-${i}.txt`), text))),
        )
        const before = yield* snapshot.track()
        if (!before) throw new Error("Expected enabled snapshots")
        if (setup.mode !== "read-only") {
          yield* Effect.promise(() =>
            Promise.all(setup.contents.map((text, i) => Bun.write(path.join(dir, `file-${i}.txt`), `agent:${text}`))),
          )
          const after = yield* snapshot.track()
          const patch = yield* snapshot.patch(before)
          yield* sessions.updatePart({
            id: PartID.ascending(),
            sessionID: session.id,
            messageID: reply.id,
            type: "patch",
            hash: patch.hash,
            after,
            files: patch.files,
          })
        }
        if (setup.mode === "read-only")
          yield* Effect.promise(() =>
            Promise.all(setup.contents.map((_, i) => Bun.file(path.join(dir, `file-${i}.txt`)).text())),
          )
        if (setup.mode === "conflict")
          yield* Effect.promise(() => Bun.write(path.join(dir, "file-0.txt"), `manual:${setup.contents[0]}`))
        send({
          type: "ready",
          directory: dir,
          promptID: prompt.id,
          messages: [
            { id: previous.id, text: "Earlier prompt" },
            { id: prompt.id, text: setup.prompt },
          ],
        })
        const command = yield* Effect.promise(() => lines.next())
        if (command.done || command.value === "dispose") return
        if (command.value !== "undo") throw new Error("Unexpected fixture command")
        const result = yield* revert.revert({ sessionID: session.id, messageID: prompt.id }).pipe(Effect.result)
        if (result._tag === "Failure") {
          if (!(result.failure instanceof Undo.ConflictError)) throw result.failure
          send({ type: "result", error: { _tag: "UndoConflictError", conflicts: result.failure.conflicts.slice() } })
        }
        if (result._tag === "Success") send({ type: "result", messageID: result.success.revert?.messageID })
        const done = yield* Effect.promise(() => lines.next())
        if (!done.done && done.value !== "dispose") throw new Error("Unexpected fixture disposal command")
      }),
    { git: true, config: { snapshot: true, formatter: false, lsp: false, plugin: [] } },
  ).pipe(Effect.scoped, Effect.provide(layer), Effect.runPromise)
  send({ type: "disposed" })
}
process.exit(0)
