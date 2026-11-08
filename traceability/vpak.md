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
| R4 | S-8: "I would probably want something to notify me [if a session is missing].” | If the session list fails to load, /sessions still opens and shows the sessions the app already has, without crashing. | If the request for the session list fails, the popup shows the sessions the app already has and does not crash. | Yes | Invariant: if loading fails, nothing crashes and old sessions still show | `packages/tui/test/component/dialog-session-list.test.ts`: "R4: if loading fails, nothing crashes and old sessions still show" | H4 |
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
| H4 | R4 | `loadDialogSessionList`: a rejected request returns `[]` instead of `undefined`, so the popup shows nothing instead of the sessions it already has | R4 property: it expects `undefined` on every failure | Killed: `["", {}, true]` returned `[]` |

## Stryker comparison

**Config:** `packages/tui/stryker.vpak.config.json`

**fast-check seed:** 42

**Mutation score:** 82.35% (14 killed, 3 survived, 0 timeouts, 17 mutants)

**Report:** `mutants/vpak/mutation.html`

### Which of your hand-written mutants did Stryker never generate? Why not?

Stryker never generated H4 because its ArrowFunction mutator only replaces a function body with `undefined`, and the failure handler in `loadDialogSessionList` already returns `undefined`, so it never tried a different return value like `[]`.

### Which Stryker survivors would you never have thought of? Are any of them bugs a real developer might plausibly write?

The mutants that survived were primarily related to boolean value flipping. Given how trivial a bug like this is, I thought it was unusual for these to survive. On the flip side, I also think that this type of bug is slightly less realistic, since determining whether an option should be set to true/false seems to a be more deliberate choice that developers will take more time to think about.

### What does each approach find that the other doesn't?

Since Stryker is automated, its mutations seem to be more thorough and numerous, increasing the likelihood of catching gaps in the tests. It generates mutants that developers may not think about, since developers can get tunnel vision and end up generating mutants that cover a narrow scope. However, the merit of manual mutant creation is that developers can come up with mutants that they believe are realistic, or ones that they think are more likely to be created. Stryker may not necessarily come up with realistic mutants.