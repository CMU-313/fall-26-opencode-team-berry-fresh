import { describe, expect, test } from "bun:test"
import { createReviewFileCopyFeedback } from "./review-file-copy-feedback"

describe("createReviewFileCopyFeedback", () => {
  // Verify a successful copy immediately records which file should show feedback.
  test("records the copied path", () => {
    const values: (string | undefined)[] = []

    const feedback = createReviewFileCopyFeedback({
      setCopiedPath: (path) => values.push(path),
    })

    feedback.copied("README.md")

    expect(values[0]).toBe("README.md")

    feedback.cleanup()
  })

  // Verify copied feedback is cleared after the configured feedback duration.
  test("clears the copied path after the feedback duration", () => {
    const values: (string | undefined)[] = []
    let scheduledCallback: (() => void) | undefined
    let scheduledDelay: number | undefined

    const feedback = createReviewFileCopyFeedback({
        setCopiedPath: (path) => values.push(path),
        schedule: ((callback: () => void, delay?: number) => {
        scheduledCallback = callback
        scheduledDelay = delay
        return 1
        }) as typeof setTimeout,
    })

    feedback.copied("README.md")

    expect(values).toEqual(["README.md"])
    expect(scheduledDelay).toBe(1500)

    scheduledCallback?.()

    expect(values).toEqual(["README.md", undefined])

    feedback.cleanup()
  })
})