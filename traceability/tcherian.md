# Traceability: Thomas Cherian (tcherian)

**Target feature:** Prompt bookmarks in the OpenCode TUI. Users can bookmark prompts, look through saved prompts with /bookmarks, and add or remove bookmarks through /timeline.

**Files or modules that implement it:**

- packages/tui/src/routes/session/bookmarks.ts: stores, retrieves, filters, and toggles session bookmarks.
- packages/tui/src/routes/session/dialog-bookmarks.tsx: implements the searchable /bookmarks.
- packages/tui/src/routes/session/dialog-timeline.tsx: displays and toggles bookmark state in /timeline.
- packages/tui/src/routes/session/index.tsx: registers the command, renders the prompt bookmark control, and goes to the selected prompts.
- packages/tui/src/context/session-history.ts and packages/tui/src/context/sync.tsx: loads and merges older bookmarked prompts.

## Requirements

| ID | Interview evidence | Requirement | Acceptance Criteria | Changed in P4? | Property (kind) | Test |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | C-11, S-7: Cindy and Zdenek both expected bookmarks to be ordered according to when they were added. | The ordering in /bookmarks should be based on when they are added rather than the original order of prompts in the conversation. | Bookmark newer prompt "A" first, then bookmark older prompt "B". /bookmarks displays A before B because A was bookmarked first. | No | Model / oracle: the generated bookmark ordering agrees with the ID associated to message model. | [`bookmarks.property.test.tsx`](../packages/tui/test/routes/session/bookmarks.property.test.tsx): `R1: bookmarks follow bookmark-addition order` |
| R2 | C-8, S-3, O-3: All three interviewees expected bookmarking to leave the conversation text and order unchanged. | Adding or removing a bookmark should not modify message text, responses, message IDs, or message ordering. | Given a session with two prompts and their responses, record every message's ID, text, role, and position. Bookmark and unbookmark the first prompt. All recorded values and the message ordering remain identical. | No | Invariant: generated bookmark operations never modify generated conversation messages. | [`bookmarks.property.test.tsx`](../packages/tui/test/routes/session/bookmarks.property.test.tsx): `R2: bookmark operations do not modify conversation messages` |
| R3 | C-9, S-4: Bookmark changes should appear immediately in the prompt UI, /bookmarks, and /timeline. | Bookmark changes should appear immediately in the prompt UI, /bookmarks, and /timeline without needing to restart or reopen the session. | Bookmark prompt A and verify that its prompt shows "Bookmarked", /bookmarks contains A, and /timeline shows A as bookmarked. Remove it and verify that all three spots immediately show that it was removed without restarting the TUI. | No | N/A — not selected for property testing. | N/A — existing component tests cover this rendered UI behavior. |
| R4 | S-5, O-5: Removing and adding the same bookmark should never create duplicate entries. | A prompt should appear at most once in a session's bookmark list. | Bookmark prompt A, remove its bookmark, and then bookmark it again. /bookmarks displays exactly one entry for A, and the messgae ID for A is only there exactly once in stored bookmark data. | No | Invariant: generated toggle sequences never produce duplicate bookmark IDs. | [`bookmarks.property.test.tsx`](../packages/tui/test/routes/session/bookmarks.property.test.tsx): `R4: bookmark lists never contain duplicate message IDs` |
| R5 | C-10, S-6, O-6, O-8: Removing one bookmark should not affect any other bookmark. | Each prompt's bookmark state should be independent of every other prompt's bookmark state. | Bookmark prompts A and B, then remove the bookmark from A. A is no longer bookmarked, while B should still be bookmarked in the prompt UI, /bookmarks, and /timeline. | No | Metamorphic: toggling one generated bookmark changes only that prompt's state. | [`bookmarks.property.test.tsx`](../packages/tui/test/routes/session/bookmarks.property.test.tsx): `R5: toggling one bookmark leaves all other bookmark states unchanged` |

## AI Disclosure
I used Codex to help originally classify the properties. Then I also used Codex to create the outline for tcherian.md. I wrote the info inside of it, but when we were given the template to write after I did not want to make that from scrach so I asked Codex to make me a template inside this file. Then Codex also helped me draft some parts of the property tests where I was having issues. Finalyl after my initaly R1 failure Codex helped me find which files the property was currently failing and help me fix it. I reviewed the generated tests and changes against my interview requirements before keeping them. 

## Requirement changes

I kept all five requirements, but selected R1, R2, R4, and R5 for property testing. Each requirement has deterministic behavior and feasible acceptance criteria. R3 simply seemed like it would take the most time so I decided not to do that one.

## Run, triage, and fix

| Requirement | Initial result | Triage | Fix | Final result |
| --- | --- | --- | --- | --- |
| R1 | Initially Failed. Fast-check reduced the failure to two messages whose bookmark addition order was the reverse of their conversation order. | Implementation defect. bookmarkedMessages filtered the conversation in message order, and the dialog then reversed that result. The requirement remained valid. | Changed bookmarkedMessages to look up messages in the stored bookmark IDs order and removed stopped the dialog revering. Changed the older order dependent example tests. | Passed 100 generated cases. |
| R2 | Passed 100 generated conversations and toggle sequences. | No failure. | None. | Passed. |
| R4 | Passed 100 generated repeated toggle sequences. | No failure. | None. | Passed. |
| R5 | Passed 100 generated bookmark sets and removals. | No failure. | None. | Passed. |

I ran bun test test/routes/session/bookmarks.property.test.tsx to check the properties, then ran the other focused bookmark suites. Those tests ran and passed 14 tests with 0 failures. Finally, bun typecheck passed and the complete TUI test suite passed 276 tests with 7 intentionally skipped and 0 failures.
