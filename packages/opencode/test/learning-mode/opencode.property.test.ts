import { afterEach, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect } from "effect"
import fc from "fast-check"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { Agent } from "../../src/agent/agent"
import { Auth } from "../../src/auth"
import { Config } from "../../src/config/config"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { Permission } from "../../src/permission"
import { Plugin } from "../../src/plugin"
import { Provider } from "../../src/provider/provider"
import { Skill } from "../../src/skill"

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([Agent.node, Plugin.node, Provider.node, Auth.node, Config.node, Skill.node, RuntimeFlags.node]),
    [[RuntimeFlags.node, RuntimeFlags.layer({})]],
  ),
)

// Fixed seed so fast-check generates the same inputs on every run.
fc.configureGlobal({ seed: 42 })

afterEach(async () => {
  await disposeAllInstances()
})

// The commands named by the R3 acceptance criteria: a harmless listing, a test run, and two
// git commands that mutate a remote or repository history.
const acceptedCommands = fc.constantFrom("ls", "bun test", "git commit -m x", "git push")

// R3: "Tutor must not run any shell commands, including git commands."
// Kind: invariant
it.instance("R3: tutor denies shell commands including git commands", () =>
  Effect.gen(function* () {
    const svc = yield* Agent.Service
    const tutor = (yield* svc.get("tutor"))!
    fc.assert(
      fc.property(acceptedCommands, (command) => {
        expect(Permission.evaluate("bash", command, tutor.permission).action).toBe("deny")
      }),
    )
  }),
)
