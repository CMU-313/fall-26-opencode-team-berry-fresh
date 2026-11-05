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

afterEach(async () => {
  await disposeAllInstances()
})

const agents = Effect.gen(function* () {
  const svc = yield* Agent.Service
  return { tutor: (yield* svc.get("tutor"))!, build: (yield* svc.get("build"))! }
})

// Project-relative file paths: 0-3 directory levels (including dotted and spaced folder names
// students actually have, like ".github" or "my notes") ending in a file with a common extension.
const projectPath = fc
  .tuple(
    fc.array(fc.oneof(fc.constantFrom("src", "test", ".github", "my notes"), fc.stringMatching(/^[a-z0-9_-]{1,8}$/)), {
      maxLength: 3,
    }),
    fc.stringMatching(/^[a-zA-Z0-9_-]{1,10}$/),
    fc.constantFrom(".ts", ".md", ".json", ".py", ""),
  )
  .map(([dirs, name, ext]) => [...dirs, name + ext].join("/"))

// Secret-file names on the boundary of the .env patterns, including the allowed .env.example.
const secretPath = fc
  .tuple(fc.constantFrom("", "config/", "apps/web/"), fc.constantFrom(".env", ".env.local", "prod.env", "a.env.b", ".env.example"))
  .map(([dir, name]) => dir + name)

// Shell commands interviewees worried about (git commit/push, test runs) plus arbitrary argument text.
const shellCommand = fc.oneof(
  fc.constantFrom("ls", "bun test", "git push", "git commit -m x", "rm -rf ."),
  fc.tuple(fc.constantFrom("git commit -m", "git push", "echo", "cat"), fc.string()).map((parts) => parts.join(" ")),
)

// R1: "Tutor must never be able to create, edit, or overwrite files."
// Kind: invariant
it.instance("R1: tutor denies every file-changing tool for every project path", () =>
  Effect.gen(function* () {
    const tutor = (yield* agents).tutor
    fc.assert(
      fc.property(fc.constantFrom("edit", "write", "apply_patch"), projectPath, (tool, file) => {
        expect(Permission.disabled([tool], tutor.permission).has(tool)).toBe(true)
        expect(Permission.evaluate("edit", file, tutor.permission).action).toBe("deny")
      }),
    )
  }),
)

// R2 (revised): "Tutor must be able to read and search project files without asking for permission,
// except .env-style secret files, which ask first exactly as they do for Build."
// Kind: oracle (Build's read rules are the oracle)
it.instance("R2: tutor reads files exactly like build and never asks for non-secret files", () =>
  Effect.gen(function* () {
    const loaded = yield* agents
    fc.assert(
      fc.property(fc.oneof(projectPath, secretPath), (file) => {
        expect(Permission.evaluate("read", file, loaded.tutor.permission).action).toBe(
          Permission.evaluate("read", file, loaded.build.permission).action,
        )
        for (const tool of ["grep", "glob", "list"])
          expect(Permission.evaluate(tool, file, loaded.tutor.permission).action).toBe("allow")
      }),
    )
    fc.assert(
      fc.property(projectPath, (file) => {
        expect(Permission.evaluate("read", file, loaded.tutor.permission).action).toBe("allow")
      }),
    )
  }),
)

// R4 (revised): "The user's global permission settings must never loosen Tutor's edit, write, apply_patch,
// or bash permissions to allow, but may still make Tutor stricter."
// Kind: invariant
it.instance(
  "R4: global config cannot loosen tutor edit or bash but can tighten it",
  () =>
    Effect.gen(function* () {
      const loaded = yield* agents
      fc.assert(
        fc.property(projectPath, shellCommand, (file, command) => {
          expect(Permission.evaluate("edit", file, loaded.tutor.permission).action).toBe("deny")
          expect(Permission.evaluate("bash", command, loaded.tutor.permission).action).toBe("deny")
          expect(Permission.evaluate("bash", command, loaded.build.permission).action).toBe("allow")
          expect(Permission.evaluate("grep", file, loaded.tutor.permission).action).toBe("deny")
        }),
      )
    }),
  { config: { permission: { "*": "allow", bash: "allow", edit: "allow", grep: "deny" } } },
)

// R5: "Tutor must be able to fetch documentation from the web."
// Kind: invariant
it.instance("R5: tutor can fetch any web URL while edit and bash stay denied", () =>
  Effect.gen(function* () {
    const tutor = (yield* agents).tutor
    fc.assert(
      fc.property(fc.webUrl(), (url) => {
        expect(Permission.evaluate("webfetch", url, tutor.permission).action).toBe("allow")
        expect(Permission.evaluate("edit", "*", tutor.permission).action).toBe("deny")
        expect(Permission.evaluate("bash", "*", tutor.permission).action).toBe("deny")
      }),
    )
  }),
)
