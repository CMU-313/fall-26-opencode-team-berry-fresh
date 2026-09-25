import { describe, expect, test } from "bun:test"
import { copyReviewFilePath } from "./review-file-copy"

describe("copyReviewFilePath", () => {
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