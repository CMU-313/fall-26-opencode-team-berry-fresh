# Traceability: Rebecca Sucgang (rsucgang)

**Target feature:** Copy file path button in change-review panel

**Files or modules that implement it:**

Base: https://github.com/CMU-313/fall-26-opencode-team-berry-fresh/blob/main/packages/

- packages/app/src/pages/session/v2/review-panel-v2.tsx
- packages/app/src/pages/session/v2/review-file-copy.ts
- packages/app/src/components/file-tree-v2.tsx
- packages/app/src/pages/session/v2/session-file-list-v2.tsx
- packages/app/src/pages/session/v2/review-file-copy-feedback.ts
- packages/app/src/pages/session/v2/review-file-copy-writer.ts

## Requirements

| ID | Interview evidence | Requirement | Acceptance Criteria | Changed in P4? | Property (kind) | Test | Mutants it kills |
|---|---|---|---|---|---|---|---|
| R1 | C-5, S-6: “No edits should be made to the file. It should always return the main file path.” | Attempting to copy a file path does not modify the file's contents, whether copying succeeds or fails. | Given src/main.ts contains export const count = 1, when its path is successfully copied, the file still contains export const count = 1. | Yes | Invariant: File contents are identical before and after each copy. | [R1: copying preserves file contents](../packages/app/src/pages/session/v2/review-file-copy.property.test.ts) | H1, through its return-value assertion rather than its file-preservation assertion. |
| R2 | S-7, O-9, C-7: “If I copied A and then I copied B, B should be the one that's in my clipboard, and then same if I copy back to A, A should be the one in the clipboard.” | If you copy a file path successfully, it must replace the clipboard contents with the selected file path. | Given files src/a.ts and src/b.ts, after successfully copying A, then B, then A, the clipboard after each operation returns src/a.ts, src/b.ts, and src/a.ts, respectively. | No | Oracle: After each successful copy in a generated A → B → A sequence, the clipboard contains the expected path. An additional strengthened property checks exact paths containing trailing spaces and preservation of clipboard state after failure. | [R2: the clipboard holds the latest successfully copied path; R2: successful copy replaces clipboard, failure preserves current state](../packages/app/src/pages/session/v2/review-file-copy.property.test.ts) | H1–H5; M1 and M2 through the strengthened R2 properties. |
| R3 | O-7: “I would never want it [copying the file path] to rename the file, for example.” | Attempting to copy a file’s path must not rename or move the file, whether copying succeeds or fails. | Given src/main.ts, attempt to copy its file path with a successful clipboard write, then separately with a rejected write. In both cases, the file remains at src/main.ts, and the set of file paths in the test project is unchanged. | Yes | Invariant: The test directory’s entries are identical before and after each copy attempt. | [R3: copying preserves the original file path](../packages/app/src/pages/session/v2/review-file-copy.property.test.ts) | H1, through its return-value assertion rather than its file-preservation assertion. |
| R4 | S-8: “In the file [path]... it should just be different paths that they, different paths that end with that file.” | When copying a file path with another file with an identical name in different directories, it must include the directory information needed to distinguish the files. | Given files src/main.ts and tests/main.ts, copying the first path returns src/main.ts and copying the second path returns exactly tests/main.ts. | No | Metamorphic: Changing the directory in the path supplied to the copy helper changes the copied directory while preserving the filename. | [R4: changing the directory changes the copied path](../packages/app/src/pages/session/v2/review-file-copy.property.test.ts) | H1–H5; M2 after increasing generated directory depth. |
| R5 | O-13: “It [the file path] should just be a relative path, or whatever directory that is relative to the root directory…” | When you copy a file path, it must be relative to the root directory used in the current session. | Given the current session’s working root is /home/user/project/ and the file is /home/user/project/src/main.ts, copying the path produces src/main.ts, without the root prefix. | No | Invariant: The clipboard adapter preserves the supplied session-relative path without adding a session-directory prefix. | [R5: clipboard adapter preserves relative paths](../packages/app/src/pages/session/v2/review-file-copy.property.test.ts) | Relocated M3, through the extracted clipboard adapter; panel rendering and wiring are not tested. |
| R6 | P5: Stryker survivors exposed missing coverage of the existing success/error feedback callbacks. | A successful clipboard write triggers success feedback for the selected path; a rejected write triggers failure feedback without reporting success. | For each generated path, a successful write calls onSuccess(path) exactly once and never onFailure; a rejected write calls onFailure(path) exactly once and never onSuccess. | Added in P5 | Conditional: Only the callback matching the clipboard outcome runs, exactly once, with the original path. | [R6: copy calls only the matching feedback callback](../packages/app/src/pages/session/v2/review-file-copy.property.test.ts) | Stryker mutants 2 and 5, which remove the success and failure callbacks. |

Properties written or suggested by opencode or another AI tool: R1–R6. R1–R6 were implemented with assistance from ChatGPT. The additional R2 property was suggested by opencode and strengthened with ChatGPT assistance.

## Requirement changes

| ID | Original requirement (P3) | Revised requirement | Why it changed |
|---|---|---|---|
| R1 | When you copy a file path, the file itself should not be modified | Attempting to copy a file path does not modify the file's contents, whether copying succeeds or fails. | Checkability: "Modified" did not specify which part of the file to check. This revision clarifies the expected result by comparing the file’s contents before and after the attempt, for both a successful and a rejected clipboard write. |
| R3 | When you copy a file path, the file name itself should not be renamed. | Attempting to copy a file’s path must not rename or move the file, whether copying succeeds or fails. | Checkability: A file can move to another directory and keep the same name. The original example expected it to remain at src/main.ts, so the revision makes the full location part of the requirement and applies the check to both clipboard outcomes. |

## Running and Triage

### P4

I ran `bun test src/pages/session/v2/review-file-copy.test.ts` from `packages/app`. All eight tests passed, including the existing unit tests and the new properties for R1–R4. Fast-check found no counterexamples in the generated inputs, therefore no property failures required triage or a code fix.

### P5

After strengthening the properties and removing all mutant behavior, I ran `bun test src/pages/session/v2/review-file-copy.property.test.ts` from `packages/app`. All seven properties passed, and `bun run typecheck` completed without errors.

## Hand-written mutants

| ID | Requirement targeted | Change | Predicted killer | Actual result |
|---|---|---|---|---|
| [H1](../mutants/rsucgang/H1.patch) | R2 | Removed `await options.writeText(path)`, so copying reports success without updating the clipboard. | R2 and R4: the clipboard should contain the selected path. | Killed by R1–R4. R2 and R4 caught unchanged clipboard contents; R1 and R3 caught an incorrect success return on simulated failure. |
| [H2](../mutants/rsucgang/H2.patch) | R4 | Changed the clipboard value to `path.split("/").pop()!`, removing all directory information. | R4 and R2: the copied path should retain its directories. | Killed by R2 and R4: expected `first/xz.ts` or `src/xz.ts`, but received `xz.ts`. |
| [H3](../mutants/rsucgang/H3.patch) | R2 | Changed the clipboard value to `path.toLowerCase()`, altering uppercase characters. | R2 and R4: the copied path should preserve case. | Killed by R2 and R4: generated paths containing `Z` were copied with lowercase `z`. |
| [H4](../mutants/rsucgang/H4.patch) | R2 | Changed the clipboard value to `path.replaceAll(" ", "\\ ")`, adding backslashes before spaces. | R2 and R4: the copied path should preserve literal spaces. | Killed by R2 and R4: paths containing spaces gained extra backslashes. |
| [H5](../mutants/rsucgang/H5.patch) | R2 | Changed the clipboard value to `path.replace(/[^\x00-\x7F]/g, "")`, removing non-ASCII characters. | R2 and R4: the copied path should preserve Unicode characters. | Killed by R2 and R4: generated paths containing `é` lost that character. |

## Stryker comparison

### Initial run

- Configuration: `packages/app/stryker.rsucgang.config.json`
- Property tests: `packages/app/src/pages/session/v2/review-file-copy.property.test.ts`
- Mutated code: `packages/app/src/pages/session/v2/review-file-copy.ts`, lines 1–15
- Fast-check seed: 42
- Initial report: `mutants/rsucgang/mutation.initial.html`

| Generated | Killed | Survived | Timed out | Mutation score |
|---|---|---|---|---|
| 7 | 5 | 2 | 0 | 71.43% |

### Initial surviving mutants

| Mutant | Change | Why it survived |
|---|---|---|
| 2 | Removed `options.onSuccess(path)` | The properties supplied an empty success callback and never checked whether it ran. |
| 5 | Removed `options.onFailure(path)` | The properties supplied an empty failure callback and never checked whether it ran. |

### Hand-written mutants compared with Stryker

| Hand-written mutant | Stryker comparison |
|---|---|
| H1: omit the clipboard write | Not generated exactly. Mutant 1 emptied the entire `try` block, removing the clipboard write, success callback, and return statement. H1 removed only the clipboard write while still reporting success. |
| H2: copy only the filename | Not generated in this run. |
| H3: lowercase the path | Not generated in this run. |
| H4: escape spaces | Not generated in this run. |
| H5: remove non-ASCII characters | Not generated in this run. |

H2–H5 introduced new path-transforming expressions. This Stryker run generated block deletions, callback deletions, and Boolean replacements, but did not introduce those transformations.

### Unexpected survivors and plausible developer mistakes

My hand-written mutants focused on the copied path, so I didn't consider removing the feedback callbacks. Both deletions survived because the original properties checked clipboard contents, file preservation, and return values without checking callback execution. Accidentally removing a feedback call during refactoring is plausible and would prevent the panel from showing the success or error toast.

### What each approach finds

The hand-written mutants checked whether copying preserved directory information, capitalization, spaces, and Unicode characters. Stryker exposed missing feedback assertions that those mutants did not target. Together, the two approaches checked both the copied value and whether the helper reported the outcome correctly.

### Strengthening and verified results

I added R6 to capture the missing feedback behavior, and this property checks both clipboard outcomes for every generated path. It checks that the matching callback receives the original path exactly once, and checks that the other callback never runs. All five properties passed on the unmodified implementation. The Stryker rerun killed both callback-deletion mutants, bringing the score to 100%.

| Run | Generated | Killed | Survived | Timed out | Mutation score |
|---|---|---|---|---|---|
| Initial | 7 | 5 | 2 | 0 | 71.43% |
| After adding R6 | 7 | 7 | 0 | 0 | 100% |
| Final seven-property version | 7 | 7 | 0 | 0 | 100% |

- Fast-check seed: 42.
- Report after adding R6: `mutants/rsucgang/mutation.html`.
- Verified raw mutation score: 100%.
- Verified score excluding equivalent mutants: 100%; no mutants were classified as equivalent.
- Scope: the copy helper in `review-file-copy.ts`, lines 1–15. The panel, feedback timer, and extracted clipboard adapter were not mutated.

These Stryker results were recorded with the five-property version after adding R6. I reran Stryker after completing the agent-failure and red-team strengthening, using the final seven-property file and seed 42. All seven generated mutants were killed, with no survivors or timeouts. The final raw and equivalent-adjusted scores are both 100%; no mutants were classified as equivalent. The updated report is saved in `mutants/rsucgang/mutation.html`.

## Agent failure case

The OpenCode conversation is available through its [/share link](https://opncd.ai/share/uySuBviw). The full prompts and responses are saved in [transcript.md](../mutants/rsucgang/agent-failure/transcript.md).

### Agent suggestion

This was my prompt for OpenCode:

> Suggest a fast-check property for R2: “If you copy a file path successfully, it must replace the clipboard contents with the selected file path.” Use bun:test and fast-check.

OpenCode's first suggestion incorrectly expected a failed copy to restore the initial clipboard contents. After I explained that failure should preserve the current contents, it revised the property to use:

```ts
const basePath = `base/${pathToCopy}`;
for (const succeeds of [true, false]) {
  const currentClipboard = clipboard.read();
  const expectedClipboard = succeeds ? basePath : currentClipboard;
  await clipboard.copy(basePath, succeeds);
  expect(await clipboard.copy(basePath, succeeds)).toBe(succeeds);
  expect(clipboard.read()).toBe(expectedClipboard);
}
```

### Surviving mutant and weakness

Truanne Chen’s M1 changed `writeText(path)` to `writeText(path.trim())`. The revised agent property passed with this mutant because every generated path began with `base/` and ended with `.ts`. None contained leading or trailing whitespace, so trimming never changed the input.

### Strengthening and evidence

With ChatGPT assistance, I strengthened the generator to append one to three spaces and kept the exact clipboard-value assertion. I also removed the duplicate copy call and unused Boolean generators. The strengthened property is in [review-file-copy.property.test.ts](../packages/app/src/pages/session/v2/review-file-copy.property.test.ts).

All runs used seed 42. Output excerpts are saved in [evidence.txt](../mutants/rsucgang/agent-failure/evidence.txt).

| Property | Implementation | Result |
|---|---|---|
| Revised agent property | Original helper | Passed |
| Revised agent property | M1 applied | Survived |
| Strengthened property | M1 applied | Killed |
| Full strengthened property file at this stage | Original helper restored | 6 pass, 0 fail |

The strengthened property failed on `["xz.ts", 1]`: it expected `"base/xz.ts "` but received `"base/xz.ts"`. This demonstrates the lost trailing space. Mutant survival was measured against the agent property alone, with the other five properties filtered out.

## Red team

My feature was red-teamed by Truanne Chen, who posted three mutants on PR #37. All runs used fast-check seed 42. “Before” refers to the properties before each defense improvement.

| ID | Requirement targeted | Change | Before | After | Fix |
|---|---|---|---|---|---|
| M1 | R2 | Trim the path before copying it. | Survived the revised agent property because generated paths had no leading or trailing whitespace. | Killed by the strengthened R2 property: expected `"base/xz.ts "`, received `"base/xz.ts"`. | Generate trailing spaces and assert the exact clipboard value. |
| M2 | R4 | Compact paths longer than five segments, removing directory information. | Survived all six properties because clipboard assertions never checked paths longer than five segments. | Killed by R4 and both R2 properties: expected `src/xz/xz/xz/xz/xz.ts`, received `src/…/xz/xz.ts`. | Increase the folder generator’s maximum depth from 3 to 8. |
| M3 | R5 | Prefix relative clipboard paths with the session directory in the panel’s adapter. | Survived all six properties because they bypassed the panel adapter. | After relocating the mutant into an extracted adapter, killed by R5: expected `xz.ts`, received `/workspace/xz.ts/xz.ts`. | Extract the adapter used by the panel and test that it preserves generated relative paths exactly. |

M1 was tested against the agent property alone; its evidence is in [evidence.txt](../mutants/rsucgang/agent-failure/evidence.txt). For M3, I moved the prefixing behavior unchanged into `review-file-copy-writer.ts`, confirmed R5 killed it, then removed it. The panel uses this tested adapter, but the property does not test panel rendering or wiring.

None of the mutants is equivalent because each changes the copied path. After removing all mutant behavior, all seven properties passed and `bun run typecheck` completed without errors.