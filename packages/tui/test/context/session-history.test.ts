import { expect, test } from "bun:test"
import type { TextPart, UserMessage } from "@opencode-ai/sdk/v2"
import { mergeSessionHistory } from "../../src/context/session-history"
import { bookmarkedMessages } from "../../src/routes/session/bookmarks"

function entry(index: number, text = `Prompt ${index}`) {
  const id = `message-${index.toString().padStart(3, "0")}`
  const info: UserMessage = {
    id,
    sessionID: "session-1",
    role: "user",
    time: { created: index },
    agent: "build",
    model: { providerID: "test", modelID: "test" },
  }
  const part: TextPart = {
    id: `part-${id}`,
    sessionID: "session-1",
    messageID: id,
    type: "text",
    text,
  }
  return { info, parts: [part] }
}

test("older bookmarked prompts load without losing newer session updates", () => {
  const history = Array.from({ length: 150 }, (_, index) => entry(index + 1))
  const current = [...history.slice(-100), entry(151, "Live prompt")]
  current[current.length - 2] = entry(150, "Updated prompt")

  expect(
    bookmarkedMessages(
      ["message-010"],
      current.map((item) => item.info),
    ),
  ).toEqual([])

  const merged = mergeSessionHistory(current, history)
  const bookmarked = bookmarkedMessages(
    ["message-010"],
    merged.map((item) => item.info),
  )

  expect(merged).toHaveLength(151)
  expect(bookmarked.map((item) => item.id)).toEqual(["message-010"])
  expect(merged.find((item) => item.info.id === "message-010")?.parts.find((part) => part.type === "text")?.text).toBe(
    "Prompt 10",
  )
  expect(merged.find((item) => item.info.id === "message-150")?.parts.find((part) => part.type === "text")?.text).toBe(
    "Updated prompt",
  )
  expect(merged.at(-1)?.parts.find((part) => part.type === "text")?.text).toBe("Live prompt")
})
