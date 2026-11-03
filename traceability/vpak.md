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

| ID | Interview evidence | Requirement | Acceptance Criteria | Changed in P4? | Property (kind) | Test |
|---|---|---|---|---|---|---|
| R1 | C-3, S-3: “I would still want some way to access my sessions [even if they are old or my sessions are cluttered].” | Any past session in the current project can be found by searching its title in /sessions, even if it is older than the 100 most recent shown by default. | With 150 sessions, typing the title of the oldest session (for example "old-deploy-fix") in /sessions shows that session in the filtered list. | Yes | Invariant: any title you search for is sent to the search | `packages/tui/test/component/dialog-session-list.test.ts`: "R1: any title you search for is sent to the search" |
| R2 | C-7: “Recency of viewing should be prioritized [when showing session options].” | By default, sessions are listed newest first, by when each was last active. | Given session A last active today at 10:00 AM, B today at 09:00 AM, and C yesterday, the list shows A, then B, then C. After the user sends a message in C, C moves to the top. | Yes | Metamorphic: sessions are newest first, and the one used last moves to the top | `packages/tui/test/component/dialog-session-list.test.ts`: "R2: sessions are newest first, and the one used last moves to the top" |
| R3 | C-9, O-9: “If there was an archive or separate page for all sessions, I would go through that more comprehensive history [if I can’t find a certain session].” | /sessions lists the current project's 100 most recently active sessions, each exactly once, newest first. Older sessions can be found by searching (R1). | With 250 sessions, opening /sessions and scrolling to the bottom shows the 100 newest sessions, each exactly once, newest first. Selecting any one of them opens that session. | Yes | Model / oracle: the list shows the 100 newest sessions, each once, newest first | `packages/tui/test/component/dialog-session-list.test.ts`: "R3: the list shows the 100 newest sessions, each once, newest first" |
| R4 | S-8: "I would probably want something to notify me [if a session is missing].” | If the session list fails to load, /sessions still opens and shows the sessions the app already has, without crashing. | If the request for the session list fails, the popup shows the sessions the app already has and does not crash. | Yes | Invariant: if loading fails, nothing crashes and old sessions still show | `packages/tui/test/component/dialog-session-list.test.ts`: "R4: if loading fails, nothing crashes and old sessions still show" |
| R5 | S-7, S-9: “I would try to sort sessions in different ways, like alphabetically or by time used [to find a certain session].” | The user can switch the list between "most recent" and "alphabetical by title" order without changing which sessions are shown. | With sessions titled "bee" (newest), "Ant" and "giraffe" (oldest), alphabetical order shows Ant, bee, giraffe, ignoring capitalization. Switching back to the most recent shows bee, Ant, giraffe. Both orders contain the same 3 sessions. | No |  |  |

Properties written or suggested by opencode or another AI tool: R1, R2, R3, R4 (written with AI support)

## Requirement changes

| ID | Original requirement (P3) | Revised requirement | Why it changed |
|---|---|---|---|
| R1 | Any past session can be found by searching its title in /sessions, even if it is older than the 100 most recent shown by default. | Any past session in the current project can be found by searching its title in /sessions, even if it is older than the 100 most recent shown by default. | Sessions are kept separately for each project. |
| R2 | Sessions are listed newest first, by when each was last active, under date headings with the current day labeled "Today". | By default, sessions are listed newest first, by when each was last active. | This clashed with R5, which sorts by name. Date headings were dropped because ordering is what shows recency. |
| R3 | A "Show all sessions" option in /sessions lists the user's complete session history, newest first. | /sessions lists the current project's 100 most recently active sessions, each exactly once, newest first. Older sessions can be found by searching (R1). | Search can already find old sessions. |
| R4 | When a search finds nothing or the session list fails to load, /sessions shows a message saying so. | If the session list fails to load, /sessions still opens and shows the sessions the app already has, without crashing. | The error message was dropped. Showing the sessions already loaded is enough. The "No results found" message comes from another part of the app. |