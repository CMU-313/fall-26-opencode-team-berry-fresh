import { describe, expect, test } from "bun:test"
import { buildCommentPrompt } from "../src/component/prompt/comment"

describe("buildCommentPrompt", () => {
  test("includes the selected code", () => {
    const code = "const total = price * quantity"

    const prompt = buildCommentPrompt(code)

    expect(prompt).toContain(code)
  })

  test("asks the agent to find the exact code", () => {
    const prompt = buildCommentPrompt("const foo = 42")

    expect(prompt).toContain(
      "Find the exact occurrence of this code in the current workspace.",
    )
  })

  test("asks the agent to put the comment above the code", () => {
    const prompt = buildCommentPrompt("const foo = 42")

    expect(prompt).toContain(
      "Write the comment directly above the matching code.",
    )
  })

  test("tells the agent not to modify the code", () => {
    const prompt = buildCommentPrompt("const foo = 42")

    expect(prompt).toContain("Do not modify the code itself.")
  })

  test("preserves multiline code", () => {
    const code = `function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price, 0)
}`

    const prompt = buildCommentPrompt(code)

    expect(prompt).toContain(code)
  })
})