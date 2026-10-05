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