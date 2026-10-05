import { describe, expect, test } from "bun:test"
import { copyReviewFilePath } from "./review-file-copy"

describe("copyReviewFilePath", () => {
  // Verify a successful clipboard operation copies the exact path and reports success.
  test("copies the exact path and reports success", async () => {
    const copied: string[] = []
    const success: string[] = []
    const failure: string[] = []

    const result = await copyReviewFilePath("packages/app/src/file.tsx", {
      writeText: async (path) => {
        copied.push(path)
      },
      onSuccess: (path) => success.push(path),
      onFailure: (path) => failure.push(path),
    })

    expect(result).toBe(true)
    expect(copied).toEqual(["packages/app/src/file.tsx"])
    expect(success).toEqual(["packages/app/src/file.tsx"])
    expect(failure).toEqual([])
  })

  // Verify success is reported only after the asynchronous clipboard write completes.
  test("reports success only after the clipboard write completes", async () => {
    const events: string[] = []

    const result = await copyReviewFilePath("README.md", {
      writeText: async () => {
        events.push("write")
      },
      onSuccess: () => {
        events.push("success")
      },
      onFailure: () => {
        events.push("failure")
      },
    })

    expect(result).toBe(true)
    expect(events).toEqual(["write", "success"])
  })

  // Verify file paths remain unchanged for both root-level and deeply nested files.
  test("preserves nested paths used by normal and filtered file lists", async () => {
    const copied: string[] = []

    for (const path of ["README.md", "packages/app/src/pages/session/v2/review-panel-v2.tsx"]) {
      await copyReviewFilePath(path, {
        writeText: async (value) => {
          copied.push(value)
        },
        onSuccess: () => undefined,
        onFailure: () => undefined,
      })
    }

    expect(copied).toEqual(["README.md", "packages/app/src/pages/session/v2/review-panel-v2.tsx"])
  })

  // Verify clipboard errors report failure without incorrectly reporting a successful copy.
  test("reports clipboard failure without reporting success", async () => {
    const success: string[] = []
    const failure: string[] = []

    const result = await copyReviewFilePath("README.md", {
      writeText: async () => {
        throw new Error("clipboard unavailable")
      },
      onSuccess: (path) => success.push(path),
      onFailure: (path) => failure.push(path),
    })

    expect(result).toBe(false)
    expect(success).toEqual([])
    expect(failure).toEqual(["README.md"])
  })
})