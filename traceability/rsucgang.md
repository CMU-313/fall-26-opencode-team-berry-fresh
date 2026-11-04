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
| R1 | C-5, S-6: “No edits should be made to the file. It should always return the main file path.” | Attempting to copy a file path does not modify the file's contents, whether copying succeeds or fails. | Given src/main.ts contains export const count = 1, when its path is successfully copied, the file still contains export const count = 1. | Yes | Invariant | Pending |
| R2 | S-7, O-9, C-7: “If I copied A and then I copied B, B should be the one that's in my clipboard, and then same if I copy back to A, A should be the one in the clipboard.” | If you copy a file path successfully, it must replace the clipboard contents with the selected file path. | Given files src/a.ts and src/b.ts, after successfully copying A, then B, then A, the clipboard after each operation returns src/a.ts, src/b.ts, and src/a.ts, respectively. | No | Oracle | Pending |
| R3 | O-7: “I would never want it [copying the file path] to rename the file, for example.” | Attempting to copy a file’s path must not rename or move the file, whether copying succeeds or fails. | Given src/main.ts, attempt to copy its file path with a successful clipboard write, then separately with a rejected write. In both cases, the file remains at src/main.ts, and the set of file paths in the test project is unchanged. | Yes | Invariant | Pending|
| R4 | S-8: “In the file [path]... it should just be different paths that they, different paths that end with that file.” | When copying a file path with another file with an identical name in different directories, it must include the directory information needed to distinguish the files. | Given files src/main.ts and tests/main.ts, copying the first path returns src/main.ts and copying the second path returns exactly src/main.ts. | No | Metamorphic | Pending |
| R5 | O-13: “It [the file path] should just be a relative path, or whatever directory that is relative to the root directory…” | When you copy a file path, it must be relative to the root directory used in the current session. | Given the current session’s working root is /home/user/project/src/ and the file is /home/user/project/src/main.ts, copying the path produces src/main.ts, without the prefix. | No | Oracle | Pending | 

Properties written or suggested by opencode or another AI tool: <list by requirement ID, or "none">

## Requirement changes

| ID | Original requirement (P3) | Revised requirement | Why it changed |
|---|---|---|---|
| R1 | When you copy a file path, the file itself should not be modified | Attempting to copy a file path does not modify the file's contents, whether copying succeeds or fails. | This revision clarifies content preservation and covers unsuccessful attempts. |
| R3 | 	When you copy a file path, the file name itself should not be renamed. | Attempting to copy a file’s path must not rename or move the file, whether copying succeeds or fails. | The revision makes preservation of the file’s location more explicit: moving a file can change its path without changing its basename. It also clarifies that clipboard failure does not allow changes to the file. |