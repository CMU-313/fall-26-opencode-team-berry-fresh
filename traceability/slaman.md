# Traceability: Sara Laman (slaman)

**Target feature:** Learning Mode (read-only parts): the Tutor agent's permission policy and how the `/explain` command sends requests to Tutor. This covers which actions Tutor can and can't take, how you enter and leave Tutor, and how `/explain` arguments are handled. The wording of explanations and quiz questions is out of scope because it comes from the model and changes between runs.

**Files or modules that implement it:**

- `packages/opencode/src/agent/agent.ts`: Tutor agent definition and permissions
- `packages/opencode/src/command/index.ts`: `/explain` command registration
- `packages/core/src/plugin/agent.ts`: core plugin version of Tutor
- `packages/core/src/plugin/command.ts`: core plugin version of `/explain`

## Requirements

| ID | Interview evidence | Requirement | Acceptance Criteria | Changed in P4? | Property (kind) | Test | Mutants it kills |
|---|---|---|---|---|---|---|---|
| R1 | C-7–C-8: “I would never ever want to see it edit my files”<br>S-6–S-7: “never want it to be able to change any code, documentation, or tests”<br>O-4–O-5: “never alter code or certainly delete files” | Tutor must never be able to create, edit, or overwrite files. | With default settings, the `edit`, `write`, and `apply_patch` tools all evaluate to deny for Tutor (e.g., editing `src/index.ts` → deny). | No | Invariant: `R1: tutor denies every file-changing tool for every project path`. Added in P5: invariant and oracle `R1: tutor denies every tool outside its read-only set and starts only the explore subagent` | [learning-mode.property.test.ts](../packages/opencode/test/learning-mode/learning-mode.property.test.ts), both R1 tests | H1 (after P5 strengthening) |
| R2 | O-7–O-8: doesn't want it “to ask me for permission to do things like search or find” | Tutor must be able to read and search project files without asking for permission, except `.env`-style secret files, which ask first exactly as they do for Build. | For Tutor, `read`, `grep`, `glob`, and `list` each evaluate to allow for a non-secret file inside the project (e.g., reading `src/index.ts` → allow). Reading `.env` or `config.env.local` evaluates to ask, the same as Build, while reading `.env.example` (a committed template with placeholder values, not real secrets) evaluates to allow. | Yes | Oracle: `R2: tutor reads files exactly like build and never asks for non-secret files` | [learning-mode.property.test.ts](../packages/opencode/test/learning-mode/learning-mode.property.test.ts), `R2: tutor reads files exactly like build and never asks for non-secret files` | H2 |
| R3 | C-10–C-12: “running those commands, no”<br>C-22–C-23: “could have still committed and pushed something up to the repository” | Tutor must not run any shell commands, including git commands. | For Tutor, `ls`, `bun test`, `git commit -m x`, and `git push` each evaluate to deny. | No | Invariant (added in P5): `R3: tutor denies every shell command, including read-only git commands` | [learning-mode.property.test.ts](../packages/opencode/test/learning-mode/learning-mode.property.test.ts), `R3: tutor denies every shell command, including read-only git commands` | H5 (after P5 strengthening; before that, only R4 caught it) |
| R4 | C-13–C-14: “people shouldn't be able to make Tutor into a regular agent”<br>O-9–O-12: “the Tutor settings should win… you can't modify or delete files and you're safe” | The user's global permission settings must never loosen Tutor's `edit`, `write`, `apply_patch`, or `bash` permissions to allow, but may still make Tutor stricter. | With `opencode.json` set to `{"permission": {"bash": "allow", "edit": "allow"}}`, `bash` and `edit` still evaluate to deny for Tutor. `bash` still evaluates to allow for Build. A global rule that denies a tool Tutor normally allows (e.g., `"grep": "deny"`) still applies to Tutor. | Yes | Invariant: `R4: global config cannot loosen tutor edit or bash but can tighten it` (Build is the control) | [learning-mode.property.test.ts](../packages/opencode/test/learning-mode/learning-mode.property.test.ts), `R4: global config cannot loosen tutor edit or bash but can tighten it` | H3, H5 |
| R5 | C-10: “pulling documentation from the web, yes”<br>S-11–S-12: “fine for it to pull relevant information from the internet” | Tutor must be able to fetch documentation from the web. | For Tutor, `webfetch` evaluates to allow. `edit` and `bash` still evaluate to deny. | No | Invariant: `R5: tutor can fetch any web URL while edit and bash stay denied` | [learning-mode.property.test.ts](../packages/opencode/test/learning-mode/learning-mode.property.test.ts), `R5: tutor can fetch any web URL while edit and bash stay denied` | H4, H5 (after P5 strengthening) |
| R6 | C-17–C-18: “should be the same for any situation”<br>S-16–S-17: “expect the output to be the same in all scenarios”<br>O-21–O-23: “the user should know that they are getting the same thing” | Tutor's permissions must be identical no matter how Tutor is entered. | `/explain`, `/explain src/a.ts`, `/explain src/a.ts src/b`, `/explain src/b src/a.ts`, and selecting Tutor with Tab are all directly handled by the tutor agent with an identical set of permissions. | No | — | — | — |
| R7 | C-14: “the whole chat is not modified”<br>S-13–S-14: “like to see the same conversation when I switch back to Build” | Switching from Tutor back to Build must keep the conversation history intact. | After `/explain src/index.ts` (for example), switching to Build and sending a prompt in the same session keeps every earlier Tutor message, in order and unchanged. | No | — | — | — |

Properties written or suggested by opencode or another AI tool: R1, R2, R4, R5 (written with Claude Code)

## Requirement Changes

| ID | Original requirement (P3) | Revised requirement | Why it changed |
|---|---|---|---|
| R2 | Tutor must be able to read and search files without asking for permission.<br>Acceptance criteria: For Tutor, `read`, `grep`, `glob`, and `list` each evaluate to allow (not ask) for a file inside the project (e.g., reading `src/index.ts` → allow). | Tutor must be able to read and search project files without asking for permission, except `.env`-style secret files (`*.env`, `*.env.*`, but not `*.env.example`), which ask first exactly as they do for Build. | **Conflict** with an existing security constraint. Build already asks before reading `.env` files because they usually hold API keys and passwords. Tutor is read-only, but anything it reads is still sent to the model provider and shown in the chat, so a blanket "never ask" would let Tutor leak secrets that Build protects. Read-only protects files from being changed, not from being exposed. The interview need (O-7–O-8: no permission prompts for routine searching and finding) is unchanged for every normal project file. |
| R4 | The user's global permission settings must not override Tutor's read-only permissions. | The user's global permission settings must never loosen Tutor's `edit`, `write`, `apply_patch`, or `bash` permissions to allow, but may still make Tutor stricter. | **Checkability and conflict.** "Must not override" was ambiguous: read literally, Tutor would also ignore a user who sets a global rule to make it *stricter* (e.g., denying a tool), which would work against the safety the interviewees asked for. The interviewees' concern (C-13–C-14, O-9–O-12) was that settings could turn Tutor into an agent that edits files or runs commands, so the revision states exactly which permissions can't be loosened. |

R1, R3, R5, R6, and R7 are kept as written. Each one names exact tools or actions with an expected allow/deny result (or, for R6 and R7, a concrete scenario to compare), so they can be built and checked without revision.

## Running and Triage

| ID | First run | Shrunk counterexample | Triage outcome | Resolution |
|---|---|---|---|---|
| R1 | Pass | — | Code already meets the requirement | None needed. Tutor's `"*": "deny"` rule covers `edit`, and `write` and `apply_patch` are checked through the same `edit` permission. |
| R2 | **Fail** | `".env"`: Build → ask, Tutor → allow | **Code bug.** Tutor's `read: "allow"` overrode the `.env` rules it inherited from the defaults, so Tutor read secret files that Build asks about. | Moved Build's `.env` read rules into one shared `read` constant in `agent.ts` and gave it to both Build and Tutor, so the oracle and Tutor can't drift apart. |
| R4 | **Fail** | `["-.ts", "git commit -m "]` with global config `{"*": "allow", "bash": "allow", "edit": "allow"}`: Tutor `edit` → allow | **Code bug.** Tutor's rules were merged as `defaults, tutor, user`, and the last matching rule wins, so the user's global config replaced Tutor's denies. | Added a final `{ edit: "deny", bash: "deny" }` rule after the user config. Global config can still tighten Tutor (the property checks that a global `grep: "deny"` still applies) but can no longer re-enable edits or shell commands. |
| R5 | **Fail** | `"http://a.aa"`: Tutor `webfetch` → deny | **Code bug.** Tutor's `"*": "deny"` also blocked `webfetch`, which the requirement and interviews (C-10, S-11–S-12) say should be allowed. The P2 test in `agent.test.ts` had asserted the old deny. | Added `webfetch: "allow"` to Tutor. Updated the P2 test and `UserGuide.md` to match the requirement. |

## Additional Notes

- **Why R1, R2, R4, and R5.** R1 has the strongest interview evidence (all three interview groups), and R2, R4, and R5 each test a different part of the permission policy (reading secrets, config precedence, web access). R3 is enforced by the same `"*": "deny"` rule as R1, so a property for it would add little new information. R6 and R7 depend on running a full session with a model, which is slower and less deterministic in CI.
- **Why only the opencode copy of Tutor is tested.** The repo contains two implementations of the built-in agents: the current one in `packages/opencode/src/agent/agent.ts` (used by today's session flow), and an in-progress rewrite in `packages/core/src/plugin/agent.ts` that opencode is migrating toward. Tutor was added to both in P2, but the properties and fixes in this project target the opencode copy because it is the behavior users currently get.

## Hand-Written Mutants

Patches are in `mutants/slaman/`. Each mutant changes the Tutor permission rules in `packages/opencode/src/agent/agent.ts`. Tutor's permissions are a list of rules merged as `defaults`, Tutor's own rules, the user's global config, then a final `{ edit: "deny", bash: "deny" }` guard, and the last matching rule wins. Predictions were written and committed before any mutant was run. Results use the fast-check seed fixed at 42.

| ID | Requirement targeted | Change | Predicted killer | Actual result |
|---|---|---|---|---|
| H1 | R1 | Tutor's `task: { "*": "deny", explore: "allow" }` becomes `task: "allow"`, as if to let Tutor hand questions to any helper agent. Tutor could then start the `general` subagent, which can edit files, so Tutor can change files indirectly. | **None (survives).** No property checks `task`. R1 only checks the `edit`, `write`, and `apply_patch` permissions directly, and those are still denied. | **Survived**, as predicted. All four properties pass, because they never look at `task`. R1 checks `edit`, `write`, and `apply_patch` directly, and those are still denied, so it can't see a route to file changes through a subagent. After strengthening R1 (every tool outside Tutor's read-only set is denied, and the only subagent Tutor may start is explore), **killed** by R1. Counterexample: `"build"`, where Tutor `task` → allow (expected deny). |
| H2 | R2 | Tutor's `grep: "allow"` becomes `grep: "ask"`, so Tutor asks permission before every search. | **R2.** Besides comparing `read` to Build, R2 checks that `grep`, `glob`, and `list` are `allow` for every generated path, and nothing later in the rule list overrides `grep`. | **Killed** by R2, as predicted. Counterexample: `"A.ts"`, where Tutor `grep` → ask (expected allow). |
| H3 | R4 | The final `{ edit: "deny", bash: "deny" }` guard is moved before `user`, so the user's global config comes last again. | **R4.** R4 runs with a global config that sets `bash` and `edit` to `allow`. With the user config last, those allows win, and R4 checks that Tutor's `edit` and `bash` stay `deny`. This is the P4 bug put back. | **Killed** by R4, as predicted. Counterexample: `["0.ts", "git commit -m "]`, where Tutor `edit` → allow (expected deny). |
| H4 | R5 | Tutor's `webfetch: "allow"` becomes `{ "*": "allow", "http://*": "deny" }`, as if to make Tutor use secure connections only. Tutor can no longer fetch `http://` documentation, such as a local docs server at `http://localhost`. | **R5.** R5 checks `webfetch` is `allow` for every `fc.webUrl()` URL. R5's P4 counterexample was `http://a.aa`, so the generator produces `http://` URLs, and H4 denies them. | **Killed** by R5, as predicted. Counterexample: `"http://a.aa"`, where Tutor `webfetch` → deny (expected allow). This is the same URL R5 shrank to in P4. |
| H5 | R3 | The final guard's `bash: "deny"` becomes `{ "*": "deny", "ls*": "allow" }`, as if to let Tutor list files. Tutor can then run `ls`, which is a shell command. | **R4** (R3 has no property). R4's `shellCommand` generator includes the literal `ls`, and R4 checks Tutor's `bash` is `deny` for every command. R1 doesn't check `bash`, and R5 only checks the literal pattern `"*"`, which `ls*` doesn't match. | **Killed** by R4, as predicted. Counterexample: `["_.ts", "ls"]`, where Tutor `bash` → allow (expected deny). R4 caught it only because `ls` is one of its five fixed commands; R3 itself still has no property. After P5 strengthening, also killed by the new R3 property (counterexample `"ls "`), R1's deny-by-default property, and R5, which now checks generated commands. |

## Stryker Comparison

**Config:** `packages/opencode/stryker.slaman.config.json`. 

**Reports:** `mutants/slaman/mutation-initial.html` (before strengthening) and `mutants/slaman/mutation.html` (after).

**Seed:** `fc.configureGlobal({ seed: 42 })`, set at the top of the property test file and used for every Stryker and hand-written mutant run.

**Mutation Score:**
- Before strengthening: 50.00% (9 of 18 killed).
- After strengthening: **94.44%** as Stryker reports it (17 of 18 killed), and **100%** excluding the 1 equivalent mutant (17 of 17).

**Which of your hand-written mutants did Stryker never generate? Why not?**
Stryker never generated any of my hand-written mutants (H1–H5), because it only empties values (`"allow"` → `""`, `{...}` → `{}`). It never writes a new value, adds a new rule, or moves code. H2 (`"allow"` → `"ask"`), H4 (`"http://*": "deny"`), and H5 (`"ls*": "allow"`) all need a new value. H1 (`task: "allow"`) is close to a Stryker mutant (`task: {}`), but still needs a new value. H3 moves the final guard before `user`, and Stryker has no mutator that reorders code, even though order decides everything here because the last matching rule wins. These are realistic, deliberate edits, like "ask before searching" or "secure connections only", which syntax-level mutators don't make.

**Which Stryker survivors would you never have thought of? Are any of them bugs a real developer might plausibly write?**
- **Deleting all of Tutor's own rules** (`Permission.fromConfig({...})` → `Permission.fromConfig({})`). I assumed Tutor's `"*": "deny"` was what kept it read-only, but every property still passed without it, because the defaults and the final guard happen to give the right answer for the tools the properties check. Tutor would then be allowed every other tool, including `task` with the `general` subagent, which edits files. This is a plausible real bug if someone "simplifies" Tutor's rules because the guard seems to cover them. I killed it with a new R1 property: every tool outside Tutor's read-only set is denied, and `task` may only start `explore`.
- **Emptying the `.env` rules in the shared `read` constant.** R2's oracle compares Tutor to Build, and I didn't see that sharing the constant (my own P4 fix) means a broken rule breaks both the same way, so they still match. This is a plausible real bug that would let Tutor read secrets without asking (red-team mutant A1 did the same thing). I killed it by checking secret paths directly: `.env` files must be `ask`, and `.env.example` must be `allow`.

**What does each approach find that the other doesn't?**
Hand-written mutants come from the requirements, so they test realistic ways the policy could be weakened on purpose: rule order (H3), new exceptions (H4, H5), and indirect routes to file changes (H1). Stryker is mechanical, but it tries every rule, including ones I assumed were covered, and it found that Tutor's deny-by-default and the `.env` rules weren't protected by any property. I missed those while designing mutants because I was thinking about which tools Tutor should use, not about which rule actually produced each answer. Stryker is weaker on configuration than on logic: it made only 18 mutants and can't produce changes like H2–H5.

**Equivalent mutants**
- `question: "allow"` → `question: ""` (line 197). The question tool never asks for permission when it runs, and the only place its rule is read is `Permission.disabled`, which hides a tool only when its rule is `"deny"`. An empty action isn't `"deny"`, so the quiz tool stays available and runs exactly as with `"allow"`, and nothing observable changes.

**Additional notes**
- **Narrowed scope:** A first run also mutated the `defaults` block and Tutor's metadata (`name`, `description`, `mode`, `native`), with 35 mutants and a 37.14% score. I narrowed `mutate` to the code Tutor's permissions actually use: the shared `read` rules (lines 121–126), the user's config (line 141), and Tutor's permission list (lines 189–208).
- **Why only 18 mutants:** Tutor's permission policy is configuration with no conditions or operators, so Stryker can only empty strings (14 mutants) and objects (4 mutants).
- **Config settings:** `concurrency: 2` and `timeoutMS: 60000`, because each test run starts the full Agent service. With Stryker's defaults, every mutant timed out, and the report showed a meaningless 100%.

## Agent Failure Case

**Transcript excerpt**

`/share` link: https://opncd.ai/share/43GG0sv9

My prompt to opencode:

> I am writing fast-check property-based tests for some requirements of the Tutor agent's permissions (found in packages/opencode/src/agent/agent.ts). I was wondering if you could write one fast-check property for the following requirement:
>
> R3: Tutor must not run any shell commands, including git commands.
>
> Acceptance criteria: For Tutor, `ls`, `bun test`, `git commit -m x`, and `git push` each evaluate to deny.
>
> Please put the property in a new file (packages/opencode/test/learning-mode/agent-r3.property). Check permissions with Permission.evaluate("bash", command, tutor.permission) from src/permission. Please reference packages/opencode/test/agent/agent.test.ts to see how to load an agent in a test. Please also reference packages/opencode/test/learning-mode/learning-mode.property.test.ts to match the formatting and structure of the existing property tests, but DO NOT reuse. Finally, run the test from packages/opencode with `bun test --timeout 30000 test/learning-mode/agent-r3.property.test.ts` to ensure it passes.

Note: After running the prompt above, I decided to rename `agent-r3.property.test.ts` to `opencode.property.test.ts` (changing none of the contents) for clarity.

Property opencode wrote:

```ts
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
```

Report from opencode:
"Test passes: 1 pass, 0 fail."

**The mutant it let survive:** 
The red-team mutant A2 from afels, which changes the final guard's `bash: "deny"` to `{ "*": "deny", "git log*": "allow", "git diff*": "allow", "git show*": "allow", "git status*": "allow" }`, as if to let Tutor explain recent changes. Tutor can then run `git log -5`, which breaks R3 ("including git commands"). With A2 applied, opencode's property still passes (1 pass, 0 fail).

**Why the property was too weak:** 
The generator is `fc.constantFrom` over the four commands in the acceptance criteria, so fast-check repeats the same four inputs 100 times. It's really four example tests written as a property. It never tries any other command, so it can only catch a change that affects exactly `ls`, `bun test`, `git commit -m x`, or `git push`. A2 leaves all four denied and allows only read-only git commands, which are exactly the "safe-looking" commands someone might add. The acceptance criteria give examples, but R3 says any shell command, and the property tested only the examples.

**Strengthened version and evidence:** 
`R3: tutor denies every shell command, including read-only git commands` in `learning-mode.property.test.ts`. Its `shellCommand` generator draws from the commands interviewees worried about, read-only commands (`git log`, `git diff`, `git show HEAD`, `git status`, `pwd`, `cat README.md`, `ls -la`), a command followed by arbitrary text, and fully arbitrary strings. Applying A2 gets the following:

```
opencode's property (opencode.property.test.ts):
 1 pass
 0 fail

strengthened R3 (learning-mode.property.test.ts):
(fail) R3: tutor denies every shell command, including read-only git commands
Counterexample: ["git log "]
Expected: "deny"
Received: "allow"
```

Both properties pass on the real code (no mutant).

## Red Team

My feature was red-teamed by **Arianne Fels (afels)**, who posted three mutants on PR #35 based on commit `03da74e`. Each one changes `packages/opencode/src/agent/agent.ts`. "Before" is my P4 properties (the property file before the P5 strengthening commit), and "After" is the strengthened properties. All results use the fast-check seed 42.

| ID | Requirement targeted | Change | Before | After | Fix |
|---|---|---|---|---|---|
| A1 | R2 | Removes the `"*.env.*": "ask"` rule from the shared `read` rules, so `.env.local` and other `.env.*` files are read without asking. | **Survived.** R2's oracle compares Tutor to Build, and both use the same `read` rules, so they break the same way and still match. | **Killed** by R2. Counterexample: `".env.b"`, where Tutor `read` → allow (expected ask). | R2 now checks secret paths directly (`ask`, or `allow` for `.env.example`), and the secret-path generator produces any name ending in `.env` or `.env.<suffix>`. |
| A2 | R3 | The final guard's `bash: "deny"` becomes `"*": "deny"` plus `allow` for `git log*`, `git diff*`, `git show*`, and `git status*`, so Tutor can run read-only git commands. | **Survived.** R3 had no property, R4's command generator never produced those git commands, and R5 only checked the literal pattern `"*"`. | **Killed** by R3, R4, and R5. Counterexample: `"git log "`, where Tutor `bash` → allow (expected deny). | New R3 property: Tutor denies every shell command. The shared command generator now includes read-only git commands and arbitrary text, and R5 checks generated commands. |
| A3 | R4 | The final `{ edit: "deny", bash: "deny" }` guard is only added when the global config has `"*": "allow"`. | **Survived.** R4 ran with one fixed config, which always had `"*": "allow"`, so the guard was still added in the only case it tested. | **Killed** by R4. Counterexample: `{"edit": "allow"}`, where Tutor `edit` → allow (expected deny). | R4 now generates the global config (any mix of `"*"`, `bash`, and `edit`, as a whole or per pattern), with each case in its own project folder. |

All three mutants were killed by strengthening properties, so none are argued equivalent. Arianne checked her mutants against a copy of my permission logic, and applying her patches to the real code confirmed that each one survived my P4 properties, as she predicted.
