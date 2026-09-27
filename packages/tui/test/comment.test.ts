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

    expect(prompt).toContain("Find the exact occurrence of this code in the current workspace.")
  })

  test("asks the agent to put the comment above the code", () => {
    const prompt = buildCommentPrompt("const foo = 42")

    expect(prompt).toContain("Write the comment directly above the matching code.")
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

describe("comment search context", () => {
  test("includes the workspace and editor hint", () => {
    const prompt = buildCommentPrompt("return total", "/workspace/project", "/workspace/project/example.py")

    expect(prompt).toContain('Workspace root: "/workspace/project"')
    expect(prompt).toContain('Editor file hint: "/workspace/project/example.py"')
  })

  test("preserves indentation and trailing whitespace", () => {
    const code = "    return total  \n"

    expect(buildCommentPrompt(code)).toContain("```\n" + code + "\n```")
  })

  test("keeps embedded code fences inside the selected code", () => {
    const code = 'const markdown = "```python"'

    expect(buildCommentPrompt(code)).toContain("````\n" + code + "\n````")
  })
})
