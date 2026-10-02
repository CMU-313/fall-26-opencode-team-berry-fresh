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
