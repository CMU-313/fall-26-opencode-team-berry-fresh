export function buildCommentPrompt(code: string) {
    return [
      "Add an appropriate comment for the code below.",
      "",
      "Find the exact occurrence of this code in the current workspace.",
      "Write the comment directly above the matching code.",
      "Do not modify the code itself.",
      "Use the commenting convention appropriate for the file's language.",
      "Keep the comment concise and useful.",
      "If the code appears in multiple files, determine the most likely intended file from the code and surrounding context.",
      "",
      "Selected code:",
      "```",
      code,
      "```",
    ].join("\n")
  }