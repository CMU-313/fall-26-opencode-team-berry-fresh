# Traceability: Veronica Pak (vpak)

**Target feature:** `/sessions` command: Shows a list of all the user’s OpenCode sessions and allows the user to navigate between them.

**Files or modules that implement it:**

Base: https://github.com/CMU-313/fall-26-opencode-team-berry-fresh/blob/main/packages/

- `tui/src/app.tsx`
  - `session.list` command: creates the `/sessions` command (also typed as `/resume` or `/continue`), which opens a popup listing your past conversations.
- `tui/src/component/dialog-session-list.tsx`
  - `createDialogSessionListQuery`: decides what to request from the backend: up to 100 sessions normally, or up to 30 that match what you typed in the search box.
  - `loadDialogSessionList`: sends that request and returns the list of sessions. If the request fails, the popup shows the sessions the app already has loaded.
  - `DialogSessionList`: the popup itself. It holds the search box and the list, and selecting a row opens that session.
  - `orderByRecency`: sorts the sessions so the most recently used one is at the top.
  - `options` memo: builds the rows the popup displays, grouped under date headings such as "Mon Oct 26 2026".
  - `buildOption`: turns one session into one row, showing its title and whether it's still running.

## Requirements

| ID | Interview evidence | Requirement | Acceptance Criteria | Changed in P4? | Property (kind) | Test | Mutants it kills |
|---|---|---|---|---|---|---|---|
| R1 | C-3, S-3: “I would still want some way to access my sessions [even if they are old or my sessions are cluttered].” | Typing a title in /sessions searches all of the current project's sessions for it, not just the 100 most recent shown by default. | For any title typed, with or without extra spaces, /sessions searches the current project for that title. For example, typing " old-deploy-fix " searches for "old-deploy-fix". | Yes | Invariant: any typed title is searched across the current project | `packages/tui/test/component/dialog-session-list.test.ts`: "R1: any typed title is searched across the current project" | H1 |
| R2 | C-7: “Recency of viewing should be prioritized [when showing session options].” | By default, sessions are listed newest first, by when each was last active. | Given session A last active today at 10:00 AM, B today at 09:00 AM, and C yesterday, the list shows A, then B, then C. After the user sends a message in C, C moves to the top. | Yes | Metamorphic: sessions are newest first, and the one used last moves to the top | `packages/tui/test/component/dialog-session-list.test.ts`: "R2: sessions are newest first, and the one used last moves to the top" | H2 |
| R3 | C-9, O-9: “If there was an archive or separate page for all sessions, I would go through that more comprehensive history [if I can’t find a certain session].” | /sessions lists the current project's 100 most recently active sessions, each exactly once, newest first. Older sessions can be found by searching (R1). | With any number of sessions from 0 to 250, /sessions shows the 100 most recently active ones (or all of them, if there are fewer), each exactly once, newest first. | Yes | Model / oracle: the list shows the 100 newest sessions, each once, newest first | `packages/tui/test/component/dialog-session-list.test.ts`: "R3: the list shows the 100 newest sessions, each once, newest first" | H3 |
| R4 | S-8: "I would probably want something to notify me [if a session is missing].” | If the session list fails to load, /sessions still opens and shows the sessions the app already has, without crashing. | If the request for the session list fails, the popup shows the sessions the app already has and does not crash. | Yes | Invariant: if loading fails, nothing crashes and old sessions still show | `packages/tui/test/component/dialog-session-list.test.ts`: "R4: if loading fails, nothing crashes and old sessions still show" | H4, H5 |
| R5 | S-7, S-9: “I would try to sort sessions in different ways, like alphabetically or by time used [to find a certain session].” | The user can switch the list between "most recent" and "alphabetical by title" order without changing which sessions are shown. | With sessions titled "bee" (newest), "Ant" and "giraffe" (oldest), alphabetical order shows Ant, bee, giraffe, ignoring capitalization. Switching back to the most recent shows bee, Ant, giraffe. Both orders contain the same 3 sessions. | No | N/A | N/A | N/A |

Properties written or suggested by opencode or another AI tool: R1, R2, R3, R4 (written with AI support)

## Requirement changes

| ID | Original requirement (P3) | Revised requirement | Why it changed |
|---|---|---|---|
| R1 | Any past session can be found by searching its title in /sessions, even if it is older than the 100 most recent shown by default. | Typing a title in /sessions searches all of the current project's sessions for it, not just the 100 most recent shown by default. | Feasibility: sessions load one project at a time, so search can't reach other projects. |
| R2 | Sessions are listed newest first, by when each was last active, under date headings with the current day labeled "Today". | By default, sessions are listed newest first, by when each was last active. | Conflict: R5 sorts by name. Cannot be checked: date headings can only be tested by rendering the whole popup. |
| R3 | A "Show all sessions" option in /sessions lists the user's complete session history, newest first. | /sessions lists the current project's 100 most recently active sessions, each exactly once, newest first. Older sessions can be found by searching (R1). | Feasibility: a page loading every session needs new paging code and could be slow. Search (R1) reaches older sessions. |
| R4 | When a search finds nothing or the session list fails to load, /sessions shows a message saying so. | If the session list fails to load, /sessions still opens and shows the sessions the app already has, without crashing. | Cannot be checked: an on-screen error message can only be tested by rendering the whole popup. "No results found" comes from a shared component. What the user actually needed: to not lose track of their sessions when something goes wrong. The R4 property checks that any failed load never crashes and returns no new list, so the popup keeps showing the sessions already loaded. |

## Hand-written mutants

| ID | Requirement targeted | Change | Predicted killer | Actual result |
|---|---|---|---|---|
| H1 | R1 | `createDialogSessionListQuery`: `{ search }` → `{ search: input.search }`, so the search keeps extra spaces | R1 property: the generator pads titles with spaces | Killed: `["!", " "]` searched `" ! "` |
| H2 | R2 | `orderByRecency`: comparator `b - a` → `b > a ? 1 : 0`, which never moves a newer session ahead of an older one | R2 property: random update times often put an older session first | Killed: `[[0, 1], 0]` stayed 0, 1 |
| H3 | R3 | `createDialogSessionListQuery`: `search ? 30 : 100` → `search ? 100 : 30`, so browsing loads only 30 sessions | R3 property: any count over 30 should show more than 30 | Killed: `[31]` showed 30 |
| H4 | R4 | `loadDialogSessionList`: a rejected request returns `[]` instead of `undefined`, so the popup shows an empty list instead of the cached sessions | R4 property: expects `undefined` on every failure | Killed: `["", {}, true]` returned `[]` |
| H5 | R4 | `loadDialogSessionList`: an error response returns `result.data ?? []` instead of `result.data`, so the popup shows an empty list instead of the cached sessions | R4 property: half the cases are error responses, all expected to return `undefined` | Killed: `["", null, false]` returned `[]` |

## Stryker comparison

**Config:** `packages/tui/stryker.vpak.config.json`

**fast-check seed:** 42

**Mutation score (before strengthening):** 82.35% (14 killed, 3 survived, 0 timeouts, 17 mutants)

**Report:** `mutants/vpak/mutation.html`

### Which of your hand-written mutants did Stryker never generate? Why not?

Stryker never generated H2: its only comparator change was `b - a` → `b + a`, and it never rewrites a comparator into a new expression like `b > a ? 1 : 0`. H3 was never generated either, since Stryker does not change number literals or swap ternary branches. H4 was also never generated: its ArrowFunction mutator only replaces a function body with `undefined`, and the failure handler in `loadDialogSessionList` already returns `undefined`, so no mutant tried a different value like `[]`. H5 was never generated either, since Stryker only changes existing logical operators and never adds a new `?? []` fallback.

### Which Stryker survivors would you never have thought of? Are any of them bugs a real developer might plausibly write?

The mutants that survived were primarily related to boolean value flipping. Given how trivial a bug like this is, I thought it was unusual for these to survive. On the flip side, I also think that this type of bug is slightly less realistic, since determining whether an option should be set to true/false seems to a be more deliberate choice that developers will take more time to think about.

### What does each approach find that the other doesn't?

Stryker is automated, so its mutants are more numerous and thorough and more likely to expose test gaps, including ones a developer with tunnel vision would miss. Hand-written mutants target bugs a developer considers realistic or likely, which Stryker's mutants may not be.

## Strengthening

All three Stryker survivors (`roots: true` → `false`, and the two changes to the `parentID` filter in `orderByRecency`) involved sub-agent sessions, which no generator produced. Two generators were strengthened, with no example-based tests added:

- **R2:** The generator also adds 0–5 sub-agent sessions with any update time, and the property still expects only root sessions, newest first. Kills both filter mutants.
- **R3:** The generator also adds 0–20 sub-agent sessions newer than every root session, and the server model returns them unless the query requests root sessions only. With `roots: false`, these fill some of the 100 slots and push root sessions out. Kills the `roots` mutant.

H1–H5 are each still killed by the predicted property.

**Final mutation score:** 100% raw (17 killed, 0 survived) and 100% with equivalent mutants excluded (none).

## Agent failure case

**Requirement:** R3

**opencode share link:** `https://opncd.ai/share/iibsNv2o`

### Transcript excerpt

**Prompt:**

```text
A requirement I have written for the OpenCode /sessions command is the following: /sessions lists the current project's 100 most recently active
sessions, each exactly once, newest first.

Write one fast-check property test for this requirement, using. Add it to the end of the describe block in packages/tui/test/component/dialog-session-list.test.ts, and name the test starting with "opencode R3:". Do not change or reuse the existing tests in that file. 
```

**Response** (property as opencode wrote it, before relabeling from "R5" to "R3"):

```ts
  // R5: Verify /sessions lists the 100 most recent sessions, each exactly once, newest first.
  // This property test ensures that the sessions list contains exactly 100 sessions when there are at least 100,
  // each with unique IDs, and ordered by recency (newest first).
  // Kind: invariant
  // Generators: session counts covering empty, partial, and full boundaries (0-150 sessions)
  test("opencode R5: sessions are limited to 100 newest, each unique, newest first", async () => {
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
          expect(loaded[i-1].time.updated).toBeGreaterThanOrEqual(loaded[i].time.updated)
        }
        // When there are more than 100 sessions, verify we have exactly 100
        if (count > 100) {
          expect(loaded?.length).toBe(100)
        }
      }),
    )
  })
```

### Mutant it let survive

| Mutant | Change | Result against opencode's property |
|---|---|---|
| H2 | `orderByRecency`: comparator `b - a` → `b > a ? 1 : 0`, which never moves a newer session ahead of an older one | Survived |

Stryker run scoped to this property alone: 29.41% (5 killed, 12 survived). Survivors include `roots: true` → `false`, every change to the `parentID` filter, `b - a` → `b + a` in the comparator, and replacing the whole body of `orderByRecency` with `{}`.

### Why the property was too weak

The property never calls `orderByRecency`, so the ordering code is never tested. Its "newest first" check re-reads the fake server's list, which the test built already sorted, so the check cannot fail.

### Strengthened version

```ts
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
```

Sessions get shuffled update times, so they arrive out of order, and the oracle checks the output of `orderByRecency` instead of the server's list.

### Evidence it kills the mutant

| Mutant | Result against strengthened property |
|---|---|
| H2 | Killed: `[[0, 2, 1, 3]]` was left out of order |

Stryker run scoped to the strengthened property alone: 70.59% (12 killed, 5 survived), up from 29.41%. The survivors are covered by other properties: 2 change search trimming (R1), 2 change the `parentID` filter (R2), and `roots: true` → `false` (R3).
