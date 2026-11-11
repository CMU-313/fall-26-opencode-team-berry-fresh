# Traceability: Rebecca Sucgang (rsucgang)

**Target feature:** Copy file path button in change-review panel

**Files or modules that implement it:**

Base: https://github.com/CMU-313/fall-26-opencode-team-berry-fresh/blob/main/packages/

- packages/app/src/pages/session/v2/review-panel-v2.tsx
- packages/app/src/pages/session/v2/review-file-copy.ts
- packages/app/src/components/file-tree-v2.tsx
- packages/app/src/pages/session/v2/session-file-list-v2.tsx
- packages/app/src/pages/session/v2/review-file-copy-feedback.ts


## Requirements

| ID | Interview evidence | Requirement | Acceptance Criteria | Changed in P4? | Property (kind) | Test |
|---|---|---|---|---|---|---|
| R1 | C-5, S-6: “No edits should be made to the file. It should always return the main file path.” | Attempting to copy a file path does not modify the file's contents, whether copying succeeds or fails. | Given src/main.ts contains export const count = 1, when its path is successfully copied, the file still contains export const count = 1. | Yes | Invariant: File contents are identical before and after each copy. | [R1: copying preserves file contents](../packages/app/src/pages/session/v2/review-file-copy.test.ts) |
| R2 | S-7, O-9, C-7: “If I copied A and then I copied B, B should be the one that's in my clipboard, and then same if I copy back to A, A should be the one in the clipboard.” | If you copy a file path successfully, it must replace the clipboard contents with the selected file path. | Given files src/a.ts and src/b.ts, after successfully copying A, then B, then A, the clipboard after each operation returns src/a.ts, src/b.ts, and src/a.ts, respectively. | No | Oracle: After each successful copy in a generated A → B → A sequence, the clipboard contains the expected path. | [R2: the clipboard holds the latest successfully copied path](../packages/app/src/pages/session/v2/review-file-copy.test.ts) |
| R3 | O-7: “I would never want it [copying the file path] to rename the file, for example.” | Attempting to copy a file’s path must not rename or move the file, whether copying succeeds or fails. | Given src/main.ts, attempt to copy its file path with a successful clipboard write, then separately with a rejected write. In both cases, the file remains at src/main.ts, and the set of file paths in the test project is unchanged. | Yes | Invariant: The test directory’s entries are identical before and after each copy attempt. | [R3: copying preserves the original file path](../packages/app/src/pages/session/v2/review-file-copy.test.ts)|
| R4 | S-8: “In the file [path]... it should just be different paths that they, different paths that end with that file.” | When copying a file path with another file with an identical name in different directories, it must include the directory information needed to distinguish the files. | Given files src/main.ts and tests/main.ts, copying the first path returns src/main.ts and copying the second path returns exactly src/main.ts. | No | Metamorphic: Changing the directory in the path supplied to the copy helper changes the copied directory while preserving the filename. | [R4: changing the directory changes the copied path](../packages/app/src/pages/session/v2/review-file-copy.test.ts) |
| R5 | O-13: “It [the file path] should just be a relative path, or whatever directory that is relative to the root directory…” | When you copy a file path, it must be relative to the root directory used in the current session. | Given the current session’s working root is /home/user/project/src/ and the file is /home/user/project/src/main.ts, copying the path produces src/main.ts, without the prefix. | No | N/A | N/A | 
Properties written or suggested by opencode or another AI tool: R1–R5. R1–R4 were implemented with AI assistance from ChatGPT.

## Requirement changes

| ID | Original requirement (P3) | Revised requirement | Why it changed |
|---|---|---|---|
| R1 | When you copy a file path, the file itself should not be modified | Attempting to copy a file path does not modify the file's contents, whether copying succeeds or fails. | Checkability: "Modified" did not specify which part of the file to check. This revision clarifies the expected result by comparing the file’s contents before and after the attempt, for both a successful and a rejected clipboard write. |
| R3 | 	When you copy a file path, the file name itself should not be renamed. | Attempting to copy a file’s path must not rename or move the file, whether copying succeeds or fails. | Checkability: A file can move to another directory and keep the same name. The original example expected it to remain at src/main.ts, so the revision makes the full location part of the requirement and applies the check to both clipboard outcomes. |

## Running and Triage

I ran `bun test src/pages/session/v2/review-file-copy.test.ts` from `packages/app`. All eight tests passed, including the existing unit tests and the new properties for R1–R4. Fast-check found no counterexamples in the generated inputs, therefore no property failures required triage or a code fix.

## Hand-written mutants

Each mutant is applied and tested separately.

| ID | Requirement targeted | Change | Predicted killer | Actual result |
|---|---|---|---|---|
| H1 | R2 | Removed `await options.writeText(path)`, so copying reports success without updating the clipboard. | R2 and R4: the clipboard should contain the selected path. | Killed by R1–R4. R2 and R4 caught unchanged clipboard contents; R1 and R3 caught an incorrect success return on simulated failure. |
| H2 | R4 | Changed the clipboard value to `path.split("/").pop()!`, removing all directory information. | R4 and R2: the copied path should retain its directories. | Killed by R2 and R4: expected `first/xz.ts` or `src/xz.ts`, but received `xz.ts`. |
| H3 | R2 | Changed the clipboard value to `path.toLowerCase()`, altering uppercase characters. | R2 and R4: the copied path should preserve case. | Killed by R2 and R4: generated paths containing `Z` were copied with lowercase `z`. |
| H4 | R2 | Changed the clipboard value to `path.replaceAll(" ", "\\ ")`, adding backslashes before spaces. | R2 and R4: the copied path should preserve literal spaces. | Killed by R2 and R4: paths containing spaces gained extra backslashes. |
| H5 | R2 | Changed the clipboard value to `path.replace(/[^\x00-\x7F]/g, "")`, removing non-ASCII characters. | R2 and R4: the copied path should preserve Unicode characters. | Killed by R2 and R4: generated paths containing `é` lost that character. |