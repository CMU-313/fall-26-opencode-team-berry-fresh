import { expect, test } from "bun:test"
import fc from "fast-check"
import { bookmarkedMessages, getBookmarks, toggleBookmark } from "../../../src/routes/session/bookmarks"

function memoryKV() {
  const values = new Map<string, unknown>()
  return {
    ready: true,
    get(key: string) {
      return values.get(key)
    },
    set(key: string, value: unknown) {
      values.set(key, value)
    },
  }
}

// Unique IDs as distinct prompts, while shuffling at least two bookmarks
// creates cases where adding bookmark addition id differnt from conversation order.
const orderedBookmarks = fc.uniqueArray(fc.uuid(), { minLength: 2, maxLength: 20 }).chain((ids) =>
  fc.shuffledSubarray(ids, { minLength: 2, maxLength: ids.length }).map((bookmarks) => ({
    bookmarks,
    messages: ids.map((id) => ({ id })),
  })),
)

// R1: The ordering in /bookmarks should be based on when bookmarks are added, not the original order of prompts in the conversation.
// Kind: Model / oracle
test("R1: bookmarks follow bookmark-addition order", () => {
  fc.assert(
    fc.property(orderedBookmarks, ({ bookmarks, messages }) => {
      const actual = bookmarkedMessages(bookmarks, messages).map((message) => message.id)
      expect(actual).toEqual(bookmarks)
    }),
  )
})

// Distinct IDs keep message identity, and varied text includes empty, singleline, and multiline content that bookmark operations must leave intact.
// Needed some help writing this one.
const conversationAndOperations = fc
  .uniqueArray(
    fc.record({
      id: fc.uuid(),
      role: fc.constantFrom("user", "assistant"),
      text: fc.oneof(fc.constantFrom("", "line one\nline two", "λ🍓"), fc.string({ maxLength: 80 })),
    }),
    { minLength: 1, maxLength: 20, selector: (message) => message.id },
  )
  .chain((messages) =>
    fc
      .array(fc.integer({ min: 0, max: messages.length - 1 }), { minLength: 1, maxLength: 40 })
      .map((operations) => ({ messages, operations: operations.map((index) => messages[index].id) })),
  )

// R2: Adding or removing a bookmark shall not modify message text, responses, message IDs, or message ordering.
// Kind: Invariant
test("R2: bookmark operations do not modify conversation messages", () => {
  fc.assert(
    fc.property(conversationAndOperations, ({ messages, operations }) => {
      const kv = memoryKV()
      const before = structuredClone(messages)
      operations.forEach((messageID) => {
        toggleBookmark(kv, "session", messageID)
        bookmarkedMessages(getBookmarks(kv, "session"), messages)
      })
      expect(messages).toEqual(before)
    }),
  )
})

// Repeated indices purposely toggle the same prompts on and off, including long mixed sequences that could find duplicate stored IDs.
const toggleSequence = fc.uniqueArray(fc.uuid(), { minLength: 1, maxLength: 12 }).chain((ids) =>
  fc
    .array(fc.integer({ min: 0, max: ids.length - 1 }), { minLength: 1, maxLength: 60 })
    .map((operations) => operations.map((index) => ids[index])),
)

// R4: A prompt should appear at most once in a session's bookmark list.
// Kind: Invariant
test("R4: bookmark lists never contain duplicate message IDs", () => {
  fc.assert(
    fc.property(toggleSequence, (operations) => {
      const kv = memoryKV()
      const uniqueAfterEveryToggle = operations.every((messageID) => {
        toggleBookmark(kv, "session", messageID)
        const bookmarks = getBookmarks(kv, "session")
        return bookmarks.length === new Set(bookmarks).size
      })
      expect(uniqueAfterEveryToggle).toBe(true)
    }),
  )
})

// At least two initial bookmarks guarantee that removing one prompt leaves other independently bookmarked prompts whose state can be checked.
const independentBookmarks = fc.uniqueArray(fc.uuid(), { minLength: 2, maxLength: 20 }).chain((bookmarks) =>
  fc.integer({ min: 0, max: bookmarks.length - 1 }).map((removedIndex) => ({ bookmarks, removedIndex })),
)

// R5: Each prompt's bookmark state shall be independent of every other prompt's bookmark state.
// Kind: Metamorphic
test("R5: toggling one bookmark leaves all other bookmark states unchanged", () => {
  fc.assert(
    fc.property(independentBookmarks, ({ bookmarks, removedIndex }) => {
      const kv = memoryKV()
      kv.set("session_bookmarks:session", bookmarks)
      toggleBookmark(kv, "session", bookmarks[removedIndex])
      expect(getBookmarks(kv, "session")).toEqual(bookmarks.filter((_, index) => index !== removedIndex))
    }),
  )
})
