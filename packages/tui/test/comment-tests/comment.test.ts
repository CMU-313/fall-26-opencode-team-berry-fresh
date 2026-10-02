import { describe, expect, test } from "bun:test"
import { buildCommentPrompt } from "../../src/component/prompt/comment"

describe("buildCommentPrompt", () => {
  // The selection must reach the model so it can describe the user's code.
  test("includes the selected code", () => {
    const code = "const total = price * quantity"

    const prompt = buildCommentPrompt(code)

    expect(prompt).toContain(code)
  })

  // Require an exact workspace match before inserting a comment into a file.
  test("asks the agent to find the exact code", () => {
    const prompt = buildCommentPrompt("const foo = 42")

    expect(prompt).toContain("Find the exact occurrence of this code in the current workspace.")
  })

  // Keep the generated explanation adjacent to the code it describes.
  test("asks the agent to put the comment above the code", () => {
    const prompt = buildCommentPrompt("const foo = 42")

    expect(prompt).toContain("Write the comment directly above the matching code.")
  })

  // Comment generation must not become a request to rewrite the selection.
  test("tells the agent not to modify the code", () => {
    const prompt = buildCommentPrompt("const foo = 42")

    expect(prompt).toContain("Do not modify the code itself.")
  })

  // Flattening a function would lose structure needed to understand and locate it.
  test("preserves multiline code", () => {
    const code = `function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price, 0)
}`

    const prompt = buildCommentPrompt(code)

    expect(prompt).toContain(code)
  })
})

describe("comment search context", () => {
  // Search the intended workspace and verify the editor hint against the selection.
  test("includes the workspace and editor hint", () => {
    const prompt = buildCommentPrompt("return total", "/workspace/project", "/workspace/project/example.py")

    expect(prompt).toContain('Workspace root: "/workspace/project"')
    expect(prompt).toContain('Editor file hint: "/workspace/project/example.py"')
  })

  // Exact matching depends on preserving whitespace, including a final newline.
  test("preserves indentation and trailing whitespace", () => {
    const code = "    return total  \n"

    expect(buildCommentPrompt(code)).toContain("```\n" + code + "\n```")
  })

  // Backticks inside the snippet must not prematurely close its Markdown fence.
  test("keeps embedded code fences inside the selected code", () => {
    const code = 'const markdown = "```python"'

    expect(buildCommentPrompt(code)).toContain("````\n" + code + "\n````")
  })
})

describe("comment acceptance criteria", () => {
  // Each language case checks the model request; it does not evaluate a live model's output.
  test.each([
    ["JavaScript", "example.js", "const total = prices.reduce((sum, price) => sum + price, 0)"],
    ["TypeScript", "example.ts", "function double(value: number): number {\n  return value * 2\n}"],
    ["Python", "example.py", "def greet(name):\n    return f\"Hello, {name}!\"\n"],
    ["Go", "example.go", "func square(n int) int {\n\treturn n * n\n}"],
    ["HTML", "example.html", '<button type="submit">Save</button>'],
    ["SQL", "example.sql", "SELECT name FROM users WHERE active = TRUE;"],
  ])("requests a concise, language-appropriate comment for %s", (_, file, code) => {
    const prompt = buildCommentPrompt(code, "/workspace/project", `/workspace/project/${file}`)

    expect(prompt).toEndWith(`Selected code:\n\`\`\`\n${code}\n\`\`\``)
    expect(prompt).toContain(`Editor file hint: "/workspace/project/${file}"`)
    expect(prompt).toContain("Add an appropriate comment for the code below.")
    expect(prompt).toContain("Use the commenting convention appropriate for the file's language.")
    expect(prompt).toContain("Keep the comment concise and useful.")
    expect(prompt).toContain("Do not modify the code itself.")
  })

  // Missing editor metadata should retain useful search guidance without inventing paths.
  test("uses the session workspace when no directory or file hint is available", () => {
    const prompt = buildCommentPrompt("return total")

    expect(prompt).toContain("Use the session's working directory as the workspace root.")
    expect(prompt).not.toContain("Workspace root:")
    expect(prompt).not.toContain("Editor file hint:")
  })

  // A file hint remains useful even when the session supplies the workspace implicitly.
  test("supports a file hint without an explicit workspace", () => {
    const prompt = buildCommentPrompt("return total", undefined, "example.py")

    expect(prompt).toContain("Use the session's working directory as the workspace root.")
    expect(prompt).toContain('Editor file hint: "example.py". Check this file first, but verify that the code matches.')
  })

  // Escaping keeps unusual POSIX and Windows paths unambiguous in the instructions.
  test("quotes paths containing spaces, quotes, backslashes, and newlines", () => {
    const prompt = buildCommentPrompt("return total", '/workspace/my "project"\nroot', 'C:\\source\\my "file".py')

    expect(prompt).toContain('Workspace root: "/workspace/my \\"project\\"\\nroot".')
    expect(prompt).toContain('Editor file hint: "C:\\\\source\\\\my \\"file\\".py".')
  })

  // Exercise the minimum fence length and longer fences selected from multiple backtick runs.
  test.each([
    ["const text = `hello`", "```"],
    ['const text = "``"', "```"],
    ['const text = "``` and ```````"', "````````"],
  ])("uses a fence longer than every backtick run in %s", (code, fence) => {
    expect(buildCommentPrompt(code)).toEndWith(`Selected code:\n${fence}\n${code}\n${fence}`)
  })

  // Search failures and ambiguous matches must not authorize edits to unrelated code.
  test("requires verified matches and safe handling of ambiguous or missing code", () => {
    const prompt = buildCommentPrompt("return total")

    expect(prompt).toContain("Use a literal text search, then read candidate files to verify the full snippet, including indentation.")
    expect(prompt).toContain("include hidden and ignored source files, excluding .git and dependency directories.")
    expect(prompt).toContain("Check search errors and exit codes.")
    expect(prompt).toContain("report the search failure.")
    expect(prompt).toContain("If the code appears in multiple files, determine the most likely intended file from the code and surrounding context.")
    expect(prompt).toContain("If a successful search finds no exact match, do not modify any files. Clearly report that the code could not be found.")
  })
})
