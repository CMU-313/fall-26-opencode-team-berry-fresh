import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect, Layer, Context, Schema } from "effect"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Undo } from "../snapshot/undo"
import { Snapshot } from "../snapshot"
import { Storage } from "@/storage/storage"
import { Session } from "./session"
import { MessageV2 } from "./message-v2"
import { SessionID, MessageID, PartID } from "./schema"
import { SessionRunState } from "./run-state"
import { SessionSummary } from "./summary"

export const RevertInput = Schema.Struct({
  sessionID: SessionID,
  messageID: MessageID,
  partID: Schema.optional(PartID),
  decisions: Schema.optional(Schema.Array(Undo.Decision)),
})
export type RevertInput = Schema.Schema.Type<typeof RevertInput>

export interface Interface {
  readonly revert: (input: RevertInput) => Effect.Effect<Session.Info, Session.BusyError | Undo.ConflictError>
  readonly unrevert: (input: {
    sessionID: SessionID
  }) => Effect.Effect<Session.Info, Session.BusyError | Undo.ConflictError>
  readonly cleanup: (session: Session.Info) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionRevert") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const snap = yield* Snapshot.Service
    const storage = yield* Storage.Service
    const events = yield* EventV2Bridge.Service
    const summary = yield* SessionSummary.Service
    const state = yield* SessionRunState.Service

    const revert = Effect.fn("SessionRevert.revert")(function* (input: RevertInput) {
      yield* state.assertNotBusy(input.sessionID)
      const all = yield* sessions.messages({ sessionID: input.sessionID }).pipe(Effect.orDie)
      let lastUser: SessionV1.User | undefined
      const session = yield* sessions.get(input.sessionID).pipe(Effect.orDie)

      let rev: Session.Info["revert"]
      for (const msg of all) {
        if (msg.info.role === "user") lastUser = msg.info
        const remaining = []
        for (const part of msg.parts) {
          if (rev) {
            continue
          }

          if (!rev) {
            if ((msg.info.id === input.messageID && !input.partID) || part.id === input.partID) {
              const partID = remaining.some((item) => ["text", "tool"].includes(item.type)) ? input.partID : undefined
              rev = {
                messageID: !partID && lastUser ? lastUser.id : msg.info.id,
                partID,
              }
            }
            remaining.push(part)
          }
        }
      }

      if (!rev) return session

      const parts = all.flatMap((message) => message.parts)
      const patchesAfter = (boundary: NonNullable<Session.Info["revert"]>) => {
        const message = all.findIndex((item) => item.info.id === boundary.messageID)
        return all
          .slice(message)
          .flatMap((item, i) =>
            item.parts.slice(
              i === 0 && boundary.partID ? item.parts.findIndex((part) => part.id === boundary.partID) : 0,
            ),
          )
          .filter((part) => part.type === "patch")
      }
      const previous = session.revert ? patchesAfter(session.revert) : []
      const next = patchesAfter(rev)
      const files = Array.from(new Set([...previous, ...next].flatMap((patch) => patch.files)))
      const changes = files.map((file) => {
        const prior = previous.find((patch) => patch.files.includes(file))
        const target = next.find((patch) => patch.files.includes(file))
        const last = parts.filter((part) => part.type === "patch" && part.files.includes(file)).at(-1)
        // Old transcripts may have a step-finish snapshot but no patch.after.
        const finish = last ? parts[parts.indexOf(last) - 1] : undefined
        const after =
          last?.type === "patch"
            ? (last.after ?? (finish?.type === "step-finish" ? finish.snapshot : undefined))
            : undefined
        return { file, expected: prior?.hash ?? after, desired: target?.hash ?? after }
      })
      const original = session.revert?.snapshot ?? (yield* snap.track())
      yield* snap.reconcile(changes, input.decisions)
      rev.snapshot = original
      if (rev.snapshot) rev.diff = yield* snap.diff(rev.snapshot)
      const index = all.findIndex((msg) => msg.info.id === rev.messageID)
      const range = index < 0 ? [] : all.slice(index)
      const diffs = yield* summary.computeDiff({ messages: range })
      yield* storage.write(["session_diff", input.sessionID], diffs).pipe(Effect.ignore)
      yield* events.publish(Session.Event.Diff, { sessionID: input.sessionID, diff: diffs })
      yield* sessions.setRevert({
        sessionID: input.sessionID,
        revert: rev,
        summary: {
          additions: diffs.reduce((sum, x) => sum + x.additions, 0),
          deletions: diffs.reduce((sum, x) => sum + x.deletions, 0),
          files: diffs.length,
        },
      })
      return yield* sessions.get(input.sessionID).pipe(Effect.orDie)
    })

    const unrevert = Effect.fn("SessionRevert.unrevert")(function* (input: { sessionID: SessionID }) {
      yield* Effect.logInfo("unreverting", { sessionID: input.sessionID })
      yield* state.assertNotBusy(input.sessionID)
      const session = yield* sessions.get(input.sessionID).pipe(Effect.orDie)
      if (!session.revert) return session
      if (session.revert.snapshot) {
        const all = yield* sessions.messages({ sessionID: input.sessionID }).pipe(Effect.orDie)
        const index = all.findIndex((item) => item.info.id === session.revert!.messageID)
        const files = new Map<string, string>()
        for (const [i, message] of all.slice(index).entries()) {
          const start =
            i === 0 && session.revert.partID ? message.parts.findIndex((part) => part.id === session.revert!.partID) : 0
          for (const part of message.parts.slice(start)) {
            if (part.type !== "patch") continue
            for (const file of part.files) if (!files.has(file)) files.set(file, part.hash)
          }
        }
        yield* snap.reconcile(
          Array.from(files, ([file, expected]) => ({ file, expected, desired: session.revert!.snapshot })),
        )
      }
      yield* sessions.clearRevert(input.sessionID)
      return yield* sessions.get(input.sessionID).pipe(Effect.orDie)
    })

    const cleanup = Effect.fn("SessionRevert.cleanup")(function* (session: Session.Info) {
      if (!session.revert) return
      const sessionID = session.id
      const msgs = yield* sessions.messages({ sessionID }).pipe(Effect.orDie)
      const messageID = session.revert.messageID
      const index = msgs.findIndex((msg) => msg.info.id === messageID)
      const target = index < 0 ? undefined : msgs[index]
      const remove = index < 0 ? [] : msgs.slice(index + (session.revert.partID ? 1 : 0))
      for (const msg of remove) {
        yield* sessions.removeMessage({ sessionID, messageID: msg.info.id })
      }
      if (session.revert.partID && target) {
        const partID = session.revert.partID
        const idx = target.parts.findIndex((part) => part.id === partID)
        if (idx >= 0) {
          const removeParts = target.parts.slice(idx)
          target.parts = target.parts.slice(0, idx)
          for (const part of removeParts) {
            yield* sessions.removePart({ sessionID, messageID: target.info.id, partID: part.id })
          }
        }
      }
      yield* sessions.clearRevert(sessionID)
    })

    return Service.of({ revert, unrevert, cleanup })
  }),
)

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [Session.node, Snapshot.node, Storage.node, EventV2Bridge.node, SessionSummary.node, SessionRunState.node],
})

export * as SessionRevert from "./revert"
