# 17-313 Team Berry Fresh User Guide

### System Notification and TUI Toast when OpenCode Finishes Responding
#### Author: Veronica Pak (vpak)

**The Feature:** A system notification and a TUI toast in OpenCode will be generated when OpenCode finishes responding to a prompt and the user is not currently focused on the OpenCode window. These notifications will not be generated if the user is actively using OpenCode. The toast will display the time finished, duration of response, and tokens used. The user can click on the toast to dismiss it once they have read it, or the toast will time out on its own after 5 minutes. At any time, the user can use the /notifications command in OpenCode to bring up a dialog box of the 5 most recent notifications of this nature that they received. 

**Testing:**
The following two test files contain my automated tests:
- packages/tui/test/cli/cmd/tui/notifications.test.ts (Notification tests, lines 304 - 526)
    - Covers:
        - Appearance of notification and toast, only while unfocused
        - Correctness of toast content:
            - Time response finished
            - Response duration
            - Tokens used
- packages/tui/test/cli/cmd/tui/dialog-notifications.test.tsx (/notifications dialog box tests, entire file)
    - Covers:
        - Number of toasts reflected in the box is accurate

Using a coverage report generated with genhtml, I was able to verify that these tests covered all the changes I made. The two documents containing the bulk of the logic for my changes are packages/tui/src/feature-plugins/system/notifications.ts and packages/tui/src/component/dialog-notifications.tsx, and these two files had coverage rates of 97.2% and 100%, respectively.

### Copy File Path
#### Author: Rebecca Sucgang (rsucgang)

**The Feature:** The OpenCode desktop UI includes a copy button next to each file in the change review panel. This allows users to quickly copy the complete path of a changed file. After a successful copy, the button temporarily changes to a checkmark and a confirmation toast displays the copied path.

**How to Use:**

1. From the root repository, start the OpenCode server with `bun run --cwd packages/opencode src/index.ts serve --port 4096`.
2. In a separate terminal, run `cd packages/app` and `bun run dev`, then open the localhost URL shown by Vite.
3. Add the root OpenCode repository as a project and start a new session.
4. Make sure the repository has at least one changed file and open **Files Changed**.
5. Click the copy icon next to a changed file. A checkmark and confirmation toast will appear after a successful copy.
6. Paste the path into the prompt or another text field to verify that the complete path was copied.
7. The copy button can also be used after searching for a file with **Filter files**.

**Testing:**

The following test files contain my automated tests:

- `packages/app/src/pages/session/v2/review-file-copy.test.ts`
  - Covers exact and nested file paths, clipboard success and failure, and waiting for the clipboard write to complete before reporting success.
- `packages/app/src/pages/session/v2/review-file-copy-feedback.test.ts`
  - Covers copied feedback state, the feedback timeout, repeated copies, and timer cleanup.

All 8 automated tests pass. Using Bun's coverage report, I verified that `review-file-copy.ts` and `review-file-copy-feedback.ts`, which contain the main logic for this feature, both have 100% function and line coverage.

I also manually tested the feature in both the normal and filtered changed-file views to verify that the correct path is copied and the expected checkmark and confirmation toast appear.

### Add a Code Comment with /comment Slash Command
#### Author: Sanjitha Govindan (sanjithg)

**The Feature:** The `/comment` slash command asks OpenCode to add a concise, useful comment above a selected code snippet in your workspace. OpenCode searches for the exact snippet, checks the surrounding code, and is instructed to use the file's language-specific comment syntax while preserving the code itself. This uses the configured model, so the wording of the generated comment may vary.

**How to Use:**

1. Open OpenCode in the workspace containing the code, with a configured model and an agent that can edit files, such as Build.
2. Copy the code you want explained from its source file. Include the original indentation; you can copy a single line or a complete multiline function.
3. Select `/comment` from the TUI's slash-command menu. A **Comment mode** toast will say **Paste the code you want to comment.**
4. Paste the copied code into the prompt. The paste automatically submits the comment request; no additional Enter press is needed.
5. Review the resulting file change. The comment should appear directly above the matching code and explain what it does without changing its behavior.

For example, copying this Python function and pasting it after selecting `/comment`:

```python
def square(n):
    return n * n
```

could produce this change in the source file:

```python
# Return the square of the supplied number.
def square(n):
    return n * n
```

**Behavior and Edge Cases:**

- Comment mode applies to the next text paste only. Select `/comment` again for each additional snippet.
- An empty or whitespace-only paste displays **No code pasted** and submits no request. Select `/comment` again before retrying.
- Paste the actual code, rather than a filename or a rewritten version of the snippet. Indentation and whitespace are preserved for matching; Windows line endings are normalized.
- When editor file context is available, OpenCode is instructed to check that file first and verify the match. If the snippet occurs in several files, it uses surrounding context to choose the intended file.
- If a successful search finds no exact match, the request instructs OpenCode to report that the code could not be found and leave files unchanged. Search failures should be reported separately.

**Testing:**

The feature's tests are recorded in Git at commit `cc0ad67`; the source and test files are not present in this documentation checkout.

- `packages/tui/test/comment-tests/comment.test.ts` checks prompt instructions, workspace and editor hints, multiline snippets, whitespace preservation, embedded backticks, language conventions, and search-failure guidance.
- `packages/tui/test/app-lifecycle.test.tsx` contains TUI integration tests for the command and paste workflow.
- `packages/tui/test/comment-tests/comment-output.test.ts` checks the output validator with fixed examples. These checks do not demonstrate live model quality.
- `packages/tui/test/comment-tests/comment-manual-tests.test.ts` provides functions for manual comment review and tests their behavior after editing.
- `packages/tui/test/comment-tests/comment.live.test.ts` optionally checks actual model-generated file edits. It requires a local OpenCode server, configured credentials, `OPENCODE_COMMENT_LIVE=true`, `OPENCODE_COMMENT_TEST_URL`, and `OPENCODE_COMMENT_TEST_MODEL=provider/model`.

Using genhtml, I was able to verify that saved coverage reports show 27/27 covered lines in `src/component/prompt/comment.ts` and 45/45 source-mapped lines in the `/comment` portions of `src/component/prompt/index.tsx`.

### Learning Mode: /explain Command, Tutor Agent, and Interactive Quiz
#### Author: Sara Laman (slaman)

**The Feature:** Learning mode helps students (and other users new to software development) navigate an unfamiliar codebase without risk of changing it. The primary goal of this feature is to have users discover a new educational use of OpenCode. The feature has two main parts that are critical to the functionality:

- **`/explain` slash command:** asks OpenCode to explain the whole project, a single file, or a set of files or folders in a beginner-friendly way. The explanation starts with the big picture, defines technical terms, points to real `file_path:line_number` locations, and ends with a **Where to look next** section to help users continue with their exploration.
- **Tutor agent:** a new read-only primary agent that `/explain` runs on. Tutor can read and search code (and hand broad searches to the Explore subagent), but file edits and bash commands are denied, so asking it questions never changes the project. After an explanation, Tutor offers a quick multiple-choice quiz that users can choose to take to check their understanding.

**How to Use:**

1. Open OpenCode in the project you want to learn about, with a configured model.
2. Type `/explain` in the prompt, optionally followed by what you want explained:
   - `/explain` (without any file or folder names following it) explains the whole project, starting from the README, package manifests, and entry points.
   - `/explain src/index.ts` explains a single file in depth, including where it is used.
   - `/explain src/api src/db` briefly explains each file or folder and then how they connect to each other.
3. Read the explanation. Your session switches to the **Tutor** agent, so any follow-up questions you type also stay in learning mode.
4. When asked **Want a quick quiz on this?**, choose **Yes** to answer 1-3 multiple-choice questions about the code that was explained, or **Not now** to skip. After each answer, Tutor tells you whether you were right and explains why, with references to the code.
5. Press **Tab** to switch back to the Build agent when you are ready to make changes to the project.

Note: You can also select **Tutor** with **Tab** at any time and ask questions directly, without using `/explain`.

**Behavior and Edge Cases:**

- If a path passed to `/explain` does not exist, Tutor says so and suggests similar paths it found (how spelling mistakes in file/folder names are handled).
- If you ask Tutor to change code, it explains how you could make the change yourself (which file, what to change, and why) instead of editing anything.
- Tutor only describes code it has actually read and says so when it is unsure, rather than guessing.
- Quiz questions have exactly one correct answer and do not hint at it. Explanations and quiz wording come from the configured model, so they may vary between runs.

**Testing:**

The following test files contain my automated tests:

- `packages/opencode/test/command/explain.test.ts` (entire file)
  - Covers `/explain` being registered as a built-in command on the tutor agent, and its template filling in the project root and ending with a quiz offer.
- `packages/opencode/test/agent/agent.test.ts` (tutor agent tests)
  - Covers Tutor being a native primary agent with the learning-mode prompt, allowing read, grep, glob, list, question, and the Explore subagent, and denying edit, write, bash, todowrite, webfetch, and other subagents.
- `packages/opencode/test/session/prompt.test.ts` (`/explain` end-to-end test)
  - Runs `/explain` on a fixture file and verifies that the request is answered by the tutor agent with the explain prompt, the file argument, and the project root.
- `packages/core/test/plugin/command.test.ts` and `packages/core/test/agent.test.ts`
  - Cover the same `/explain` registration and tutor permissions in the core plugin system.

Notes:
- This change was meant for the OpenCode TUI, so I also conducted manual testing in Sprint 1 to make sure the feature worked as expected.
- I ran `bun test` on my changed files in `packages/opencode` and `packages/core` to ensure that all of the tests I wrote passed. 105/105 tests passed for `packages/opencode` (one test was skipped that I did not write) and 9/9 tests passed for `packages/core`. I also ran `bun typecheck` on `packages/opencode` and `packages/core` to verify that my code changes did not introduce any type errors. 
- I used lcov and genhtml to produce a coverage report to ensure that all of my lines of changed code were hit by the tests. The coverage report showed 478/583 lines hit for `packages/opencode` (all of my lines of changed code were hit, as seen in the screenshots included in my PR comment) and 165/165 lines hit for `packages/core`.

### Prompt Bookmarks in the OpenCode TUI
#### Author: Thomas Cherian (tcherian23)

**The Feature:** Prompt bookmarks let users save prompts and return to them later in an OpenCode TUI session. Bookmarks are stored separately for each session and stay available after closing and reopening the TUI. Users can add or delete bookmarks directly on prompts, from the `/bookmarks` command, or from `/timeline` command.

**How to Use:**

1. Open a session in the OpenCode TUI and have multiple prompts.
2. Select 'Bookmark' on the right side of a prompt. This changes it to 'Bookmarked' so you know that the prompt was saved. Press it again to remove the bookmark.
3. Enter `/bookmarks` to open the bookmark command. Scroll or type in the search bar to filter the saved prompts.
4. Go to a bookmark and press 'Enter' to go to that prompt in the session.
5. To remove a bookmark while viewing the bookmarks, highlight it and press Ctrl + D.
6. Enter `/timeline` to view all prompts in the session. Bookmarked prompts are labeled Bookmarked. Highlight any prompt and press Ctrl + D to add or remove its bookmark.
7. You can close and reopen the session to make sure that its saved bookmarks are still there.

**Behavior and Edge Cases:**

- Each session has its own bookmark list, so bookmarking a prompt in one session does not affect another session.
- The bookmark page shows instruction when no prompts have been saved and a separate message when a search has no matches.
- If a saved bookmark is older than the messages initially loaded by the TUI, it loads the older session history so the prompt can still be displayed.

**Testing:**

The following test files contain my automated tests:

- `packages/tui/test/routes/session/bookmarks.test.tsx`
  - Covers bookmarks across TUI mounts, session isolation, adding and removing bookmarks, cleaning up invalid stored values, message ordering, and removed messages.
- `packages/tui/test/routes/session/bookmark-dialogs.test.tsx`
  - Renders the real bookmark and timeline and covers displaying only saved prompts, filtering by search, selecting a bookmark, removing with Ctrl + D, timeline bookmark, adding and removing from the timeline, and showing a bookmark from older session.
- `packages/tui/test/context/session-history.test.ts`
  - Uses a fake session with more than 100 prompts to show that an older bookmarked prompt loads without losing newer or updated session messages.

All 11 bookmark automated tests pass. I also manually tested bookmarking and unbookmarking prompts, searching and going through `/bookmarks`, adding and removing bookmarks from `/timeline`, and reopening a session with saved bookmarks. I ran the complete TUI test suite and TUI typecheck to check that the feature did not break the existing functionality.


