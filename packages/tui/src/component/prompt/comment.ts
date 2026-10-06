export function buildCommentPrompt(code: string, directory?: string, file?: string) {
  const fence = "`".repeat(Math.max(3, ...Array.from(code.matchAll(/`+/g), (match) => match[0].length + 1)))

  return [
    "Add an appropriate comment for the code below.",
    "",
    "Find the exact occurrence of this code in the current workspace.",
    directory
      ? `Workspace root: ${JSON.stringify(directory)}. Search from this directory explicitly.`
      : "Use the session's working directory as the workspace root.",
    ...(file
      ? [`Editor file hint: ${JSON.stringify(file)}. Check this file first, but verify that the code matches.`]
      : []),
    "Search recursively within the workspace. If the initial search finds nothing, include hidden and ignored source files, excluding .git and dependency directories.",
    "Use a literal text search, then read candidate files to verify the full snippet, including indentation.",
    "Check search errors and exit codes. A missing search executable or an unreadable directory is not evidence that the code is absent. Do not suppress stderr or mask failures with pipelines; use an available search tool or report the search failure.",
    "Write the comment directly above the matching code.",
    "Do not modify the code itself.",
    "Use the commenting convention appropriate for the file's language.",
    "Keep the comment concise and useful.",
    "If the code appears in multiple files, determine the most likely intended file from the code and surrounding context.",
    "If a successful search finds no exact match, do not modify any files. Clearly report that the code could not be found.",
    "",
    "Selected code:",
    fence,
    code,
    fence,
  ].join("\n")
}
