export const commentExamples = [
  { language: "JavaScript", file: "example.js", code: "const total = price * quantity\n", comment: "// Calculate the total cost from price and quantity.\n", syntax: "slash", meaning: [/total|cost|price/i, /quantity|multipl|times|product/i] },
  { language: "TypeScript", file: "example.ts", code: "function double(value: number): number {\n  return value * 2\n}\n", comment: "// Return twice the input value.\n", syntax: "slash", meaning: [/doubl|twice|two|2/i, /value|number|input/i] },
  { language: "Python", file: "example.py", code: 'def greet(name):\n    return f"Hello, {name}!"\n', comment: "# Return a greeting addressed to the given name.\n", syntax: "hash", meaning: [/greet|hello|welcome/i, /name|person|user/i] },
  { language: "Go", file: "example.go", code: "func square(n int) int {\n\treturn n * n\n}\n", comment: "// Return the square of the input integer.\n", syntax: "slash", meaning: [/square|itself|power of (two|2)/i, /number|integer|input|\bn\b/i] },
  { language: "HTML", file: "example.html", code: '<button type="submit">Save</button>\n', comment: "<!-- Submit the form with the Save button. -->\n", syntax: "html", meaning: [/save|submit/i, /button|form/i] },
  { language: "SQL", file: "example.sql", code: "SELECT name FROM users WHERE active = TRUE;\n", comment: "-- Select the names of active users.\n", syntax: "dash", meaning: [/active/i, /user/i] },
] as const

// These are explicit acceptance checks, not a general semantic judge: preserve
// the code, require native comment delimiters, limit length, and name its behavior.
export function requireCommentOutput(output: string, example: (typeof commentExamples)[number]) {
  if (!output.endsWith(example.code)) throw new Error("Selected code was changed or the comment was not inserted above it")
  const comment = output.slice(0, -example.code.length).trim()
  if (!comment) throw new Error("No comment was generated")
  const syntax = {
    slash: /^(?:\/\/[^\n]*(?:\n\s*\/\/[^\n]*)*|\/\*(?:(?!\*\/)[\s\S])*\*\/)$/,
    hash: /^#[^\n]*(?:\n\s*#[^\n]*)*$/,
    html: /^<!--(?:(?!--)[\s\S])*-->$/,
    dash: /^(?:--[^\n]*(?:\n\s*--[^\n]*)*|\/\*(?:(?!\*\/)[\s\S])*\*\/)$/,
  }
  if (!syntax[example.syntax].test(comment)) throw new Error("Comment syntax does not match the file's language")
  if (comment.length > 240 || comment.split(/\s+/).length > 40 || comment.split("\n").length > 3) {
    throw new Error("Comment is not concise")
  }
  if (!example.meaning.every((pattern) => pattern.test(comment))) throw new Error("Comment does not describe the selected behavior")
  return comment
}
