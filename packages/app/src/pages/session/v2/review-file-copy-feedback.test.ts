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

  // Verify copying another file cancels the previous feedback timer.
  test("replaces the previous copied path and cancels its timer", () => {
    const values: (string | undefined)[] = []
    const cancelledTimers: unknown[] = []
    let nextTimer = 1

    const feedback = createReviewFileCopyFeedback({
        setCopiedPath: (path) => values.push(path),
        schedule: (() => {
        return nextTimer++
        }) as typeof setTimeout,
        cancel: ((timer) => {
        cancelledTimers.push(timer)
        }) as typeof clearTimeout,
    })

    feedback.copied("README.md")
    feedback.copied("src/app.tsx")

    expect(values).toEqual(["README.md", "src/app.tsx"])
    expect(cancelledTimers).toEqual([1])

    feedback.cleanup()
  })

  // Verify cleanup cancels the active feedback timer when the component unmounts.
  test("cancels the active timer during cleanup", () => {
    const cancelledTimers: unknown[] = []

    const feedback = createReviewFileCopyFeedback({
        setCopiedPath: () => undefined,
        schedule: (() => {
        return 1
        }) as typeof setTimeout,
        cancel: ((timer) => {
        cancelledTimers.push(timer)
        }) as typeof clearTimeout,
    })

    feedback.copied("README.md")
    feedback.cleanup()

    expect(cancelledTimers).toEqual([1])
  })
})