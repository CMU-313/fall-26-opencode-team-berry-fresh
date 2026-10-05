import { afterEach, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect } from "effect"
import { disposeAllInstances, requireInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { Command } from "../../src/command"

const it = testEffect(LayerNode.compile(Command.node))

afterEach(async () => {
  await disposeAllInstances()
})

it.instance(
  "registers /explain as a built-in command on the tutor agent",
  () =>
    Effect.gen(function* () {
      const command = yield* Command.Service
      const explain = yield* command.get(Command.Default.EXPLAIN)
      expect(explain).toMatchObject({
        name: "explain",
        description: "explain code [files|dirs], defaults to whole project",
        agent: "tutor",
        source: "command",
        hints: ["$ARGUMENTS"],
      })
      expect((yield* command.list()).map((item) => item.name)).toContain("explain")
    }),
  { git: true },
)

it.instance(
  "fills the project root into the /explain template and ends with a quiz offer",
  () =>
    Effect.gen(function* () {
      const instance = yield* requireInstance
      const command = yield* Command.Service
      const explain = yield* command.get("explain")
      const template = yield* Effect.promise(async () => explain?.template ?? "")
      expect(template).toContain(`The project root is \`${instance.worktree}\`.`)
      expect(template).not.toContain("${path}")
      expect(template).toContain("patient mentor")
      expect(template).toContain("Where to look next")
      expect(template).toContain("quiz")
    }),
  { git: true },
)
