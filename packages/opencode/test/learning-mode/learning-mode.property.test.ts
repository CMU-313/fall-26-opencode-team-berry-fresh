import { afterEach, expect } from "bun:test"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect } from "effect"
import { ChildProcessSpawner } from "effect/unstable/process"
import fc from "fast-check"
import { disposeAllInstances, provideInstance, tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { Agent } from "../../src/agent/agent"
import { Auth } from "../../src/auth"
import { Config } from "../../src/config/config"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { Permission } from "../../src/permission"
import { Plugin } from "../../src/plugin"
import { InstanceStore } from "../../src/project/instance-store"
import { Provider } from "../../src/provider/provider"
import { Skill } from "../../src/skill"

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([Agent.node, Plugin.node, Provider.node, Auth.node, Config.node, Skill.node, RuntimeFlags.node]),
    [[RuntimeFlags.node, RuntimeFlags.layer({})]],
  ),
)

// Fixed seed so fast-check generates the same inputs on every run, and a mutant is
// killed or survives the same way each time (P5 mutation testing).
fc.configureGlobal({ seed: 42 })

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

// Secret-file names on the boundary of the .env patterns: a bare ".env", a name ending in ".env",
// ".env.<anything>", and the committed ".env.example" template, in and out of folders.
const secretPath = fc
  .tuple(
    fc.constantFrom("", "config/", "apps/web/"),
    fc.stringMatching(/^[a-z0-9_-]{0,6}$/),
    fc.constantFrom("", ".local", ".production", ".b", ".example"),
  )
  .map(([dir, prefix, suffix]) => dir + prefix + ".env" + suffix)

// Shell commands interviewees worried about (git commit/push, test runs), read-only commands
// someone might think are harmless for Tutor (git log/diff/status, added in P5 after red-team
// mutant A2), and arbitrary text with and without a command in front.
const shellCommand = fc.oneof(
  fc.constantFrom("ls", "bun test", "git push", "git commit -m x", "rm -rf ."),
  fc.constantFrom("git log", "git diff", "git show HEAD", "git status", "pwd", "cat README.md", "ls -la"),
  fc
    .tuple(fc.constantFrom("git commit -m", "git push", "git log", "git diff", "echo", "cat", "ls"), fc.string())
    .map((parts) => parts.join(" ")),
  fc.string(),
)

// Tools Tutor is meant to use: reading and searching (R2), the web (R5), the quiz tool, folders
// outside the project (which ask), and starting the read-only explore agent through task.
const tutorTools = ["read", "grep", "glob", "list", "question", "webfetch", "external_directory", "task"]

// Any other tool: real opencode tools that can change files or run commands, plus made-up names
// for tools a plugin or a future version could add.
const otherTool = fc
  .oneof(
    fc.constantFrom(
      "bash",
      "edit",
      "write",
      "apply_patch",
      "todowrite",
      "skill",
      "lsp",
      "websearch",
      "codesearch",
      "doom_loop",
      "plan_enter",
      "plan_exit",
    ),
    fc.stringMatching(/^[a-z_]{1,12}$/),
  )
  .filter((tool) => !tutorTools.includes(tool))

// Subagents Tutor might try to start: the built-in ones, including explore, and made-up names.
const subagent = fc.oneof(
  fc.constantFrom("explore", "general", "build", "plan"),
  fc.stringMatching(/^[a-z-]{1,10}$/),
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

// R1 (added in P5): Tutor can't reach file changes through another tool either. Every tool outside
// Tutor's read-only set is denied, and the only subagent it may start is explore, which can't edit.
// Before this, a mutant letting Tutor start the general subagent (which edits files) survived (H1).
// Kind: invariant (tools) and oracle (subagents: allow exactly when the name is "explore")
it.instance("R1: tutor denies every tool outside its read-only set and starts only the explore subagent", () =>
  Effect.gen(function* () {
    const tutor = (yield* agents).tutor
    fc.assert(
      fc.property(otherTool, fc.oneof(projectPath, shellCommand, fc.constant("*")), (tool, pattern) => {
        expect(Permission.evaluate(tool, pattern, tutor.permission).action).toBe("deny")
      }),
    )
    fc.assert(
      fc.property(subagent, (name) => {
        expect(Permission.evaluate("task", name, tutor.permission).action).toBe(name === "explore" ? "allow" : "deny")
      }),
    )
  }),
)

// R2 (revised): "Tutor must be able to read and search project files without asking for permission,
// except .env-style secret files, which ask first exactly as they do for Build."
// Kind: oracle (Build's read rules are the oracle, plus the expected secret-file result directly)
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
    // Added in P5: Build and Tutor share the same read rules, so comparing them can't catch a
    // broken .env rule. Check the result the requirement asks for directly: secret files ask,
    // and the committed .env.example template is allowed.
    fc.assert(
      fc.property(secretPath, (file) => {
        expect(Permission.evaluate("read", file, loaded.tutor.permission).action).toBe(
          file.endsWith(".env.example") ? "allow" : "ask",
        )
      }),
    )
  }),
)

// R3 (added in P5): "Tutor must not run any shell commands, including git commands."
// Kind: invariant
it.instance("R3: tutor denies every shell command, including read-only git commands", () =>
  Effect.gen(function* () {
    const tutor = (yield* agents).tutor
    fc.assert(
      fc.property(shellCommand, (command) => {
        expect(Permission.evaluate("bash", command, tutor.permission).action).toBe("deny")
      }),
    )
  }),
)

// Global permission settings a user might write: loosen everything with "*", loosen bash or
// edit as a whole or for some patterns, and tighten a tool Tutor normally allows (grep).
const allowOrAsk = fc.constantFrom("allow" as const, "ask" as const)
const globalPermission = fc.record(
  {
    "*": allowOrAsk,
    bash: fc.oneof(
      allowOrAsk,
      fc.dictionary(fc.constantFrom("*", "git *", "git log*", "ls*", "rm *"), allowOrAsk, { minKeys: 1 }),
    ),
    edit: fc.oneof(allowOrAsk, fc.dictionary(fc.constantFrom("*", "*.md", "src/*"), allowOrAsk, { minKeys: 1 })),
    grep: fc.constant("deny" as const),
  },
  { requiredKeys: [] },
)

// R4 (revised): "The user's global permission settings must never loosen Tutor's edit, write, apply_patch,
// or bash permissions to allow, but may still make Tutor stricter."
// Kind: invariant
// Changed in P5: the global config is generated instead of fixed. The old fixed config always had
// "*": "allow", so a guard that only applied in that case survived (red-team mutant A3).
it.instance("R4: global config cannot loosen tutor edit or bash but can tighten it", () =>
  Effect.gen(function* () {
    // Each case needs its own project folder with its own opencode.json, so the property is async
    // and runs each case as an Effect with the test's services.
    const run = Effect.runPromiseWith(
      yield* Effect.context<Agent.Service | InstanceStore.Service | ChildProcessSpawner.ChildProcessSpawner>(),
    )
    yield* Effect.promise(() =>
      fc.assert(
        fc.asyncProperty(globalPermission, projectPath, shellCommand, (permission, file, command) =>
          run(
            Effect.gen(function* () {
              const directory = yield* tmpdirScoped({ config: { permission } })
              const loaded = yield* agents.pipe(provideInstance(directory))
              expect(Permission.evaluate("edit", file, loaded.tutor.permission).action).toBe("deny")
              expect(Permission.evaluate("bash", command, loaded.tutor.permission).action).toBe("deny")
              // Tightening still applies to Tutor.
              if (permission.grep === "deny")
                expect(Permission.evaluate("grep", file, loaded.tutor.permission).action).toBe("deny")
              // Control: the same config does loosen Build.
              if (permission.bash === "allow")
                expect(Permission.evaluate("bash", command, loaded.build.permission).action).toBe("allow")
            }).pipe(Effect.scoped),
          ),
        ),
        { numRuns: 50 },
      ),
    )
    // tmpdirScoped needs a process spawner to set up each case's folder.
  }).pipe(Effect.provide(AppNodeBuilder.build(CrossSpawnSpawner.node))),
)

// R5: "Tutor must be able to fetch documentation from the web."
// Kind: invariant
it.instance("R5: tutor can fetch any web URL while edit and bash stay denied", () =>
  Effect.gen(function* () {
    const tutor = (yield* agents).tutor
    fc.assert(
      // Changed in P5: edit and bash are checked with generated paths and commands, not only "*".
      fc.property(fc.webUrl(), projectPath, shellCommand, (url, file, command) => {
        expect(Permission.evaluate("webfetch", url, tutor.permission).action).toBe("allow")
        expect(Permission.evaluate("edit", file, tutor.permission).action).toBe("deny")
        expect(Permission.evaluate("bash", command, tutor.permission).action).toBe("deny")
      }),
    )
  }),
)
