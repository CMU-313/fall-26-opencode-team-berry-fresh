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

