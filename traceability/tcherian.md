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

| R1 | C-11, S-7: Cindy and Zdenek both expected bookmarks to be ordered according to when they were added. | The ordering in /bookmarks should be based on when they are added rather than the original order of prompts in the conversation. | Bookmark newer prompt "A" first, then bookmark older prompt "B". /bookmarks displays A before B because A was bookmarked first. | No | Model / oracle: the generated bookmark ordering agrees with the ID associated to message model. | [`bookmarks.property.test.tsx`](../packages/tui/test/routes/session/bookmarks.property.test.tsx): `R1: bookmarks follow bookmark-addition order` |
| R2 | C-8, S-3, O-3: All three interviewees expected bookmarking to leave the conversation text and order unchanged. | Adding or removing a bookmark shall not modify message text, responses, message IDs, or message ordering. | Given a session with two prompts and their responses, record every message's ID, text, role, and position. Bookmark and unbookmark the first prompt. All recorded values and the message ordering remain identical. | No | Invariant: generated bookmark operations never modify generated conversation messages. | [`bookmarks.property.test.tsx`](../packages/tui/test/routes/session/bookmarks.property.test.tsx): `R2: bookmark operations do not modify conversation messages` |
| R3 | C-9, S-4: Bookmark changes should appear immediately in the prompt UI, /bookmarks, and /timeline. | Bookmark changes should appear immediately in the prompt UI, /bookmarks, and /timeline without restarting or reopening the session. | Bookmark prompt A and verify that its prompt control displays "Bookmarked", /bookmarks contains A, and /timeline labels A as bookmarked. Remove it and verify that all three locations immediately reflect the removal without restarting the TUI. | No | N/A — not selected for property testing. | N/A — existing component tests cover this rendered UI behavior. |
| R4 | S-5, O-5: Removing and adding the same bookmark should never create duplicate entries. | A prompt should appear at most once in a session's bookmark list. | Bookmark prompt A, remove its bookmark, and then bookmark it again. /bookmarks displays exactly one entry for A, and A's message ID appears exactly once in stored bookmark data. | No | Invariant: generated toggle sequences never produce duplicate bookmark IDs. | [`bookmarks.property.test.tsx`](../packages/tui/test/routes/session/bookmarks.property.test.tsx): `R4: bookmark lists never contain duplicate message IDs` | 
| R5 | C-10, S-6, O-6, O-8: Removing one bookmark should not affect any other bookmark. | Each prompt's bookmark state shall be independent of every other prompt's bookmark state. | Bookmark prompts A and B, then remove the bookmark from A. A is no longer bookmarked, while B remains bookmarked in the prompt UI, /bookmarks, and /timeline. | No | Metamorphic: toggling one generated bookmark changes only that prompt's state. | [`bookmarks.property.test.tsx`](../packages/tui/test/routes/session/bookmarks.property.test.tsx): `R5: toggling one bookmark leaves all other bookmark states unchanged` |

I used AI to help me write the requirements in the format given. I did write  the actual text myself, but file names and other were added using AI. 

## Requirement changes

I kept all five of the requirements but I am only testing on R1, R2, R4, and R5. Each requirement has deterministic behavior with has a feasable acceptance criteria, and none are unreasonable to implementation. R1 is not currently implemented correctly, but it is feasible, so a failing property should lead to a code fix rather than a requirement revision.

## Run, triage, and fix

To be completed after running the properties against the implementation.
