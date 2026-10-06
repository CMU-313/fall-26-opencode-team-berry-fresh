import { describe, expect, test } from "bun:test"
import { commentExamples, requireCommentOutput } from "../fixture/comment-output"

describe("comment output acceptance checks", () => {
  // These examples test the evaluator; they are not claimed as generated model responses.
  test.each([...commentExamples])("accepts a concise, descriptive $language comment", (example) => {
    expect(requireCommentOutput(example.comment + example.code, example)).toBe(example.comment.trim())
  })

  test.each([...commentExamples])("rejects missing, incorrect, or verbose $language output", (example) => {
    expect(() => requireCommentOutput(example.code, example)).toThrow("No comment")
    expect(() => requireCommentOutput("This is plain prose.\n" + example.code, example)).toThrow("syntax")
    expect(() => requireCommentOutput(example.comment + example.code + "changed", example)).toThrow("changed")
    expect(() => requireCommentOutput(example.comment.replace(/[A-Za-z]+/g, "blah") + example.code, example)).toThrow("describe")
    expect(() => requireCommentOutput(example.comment.replace(/\./, " explanation".repeat(50) + ".") + example.code, example)).toThrow("concise")
  })
})
