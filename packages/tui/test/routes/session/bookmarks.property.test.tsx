import { expect, test } from "bun:test"
import fc from "fast-check"
import { bookmarkedMessages, getBookmarks, toggleBookmark } from "../../../src/routes/session/bookmarks"

// A fixed seed keeps hand-written and Stryker mutation results reproducible.
fc.configureGlobal({ seed: 42 })

function memoryKV(ready = true) {
  const values = new Map<string, unknown>()
  return {
    ready,
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

// Removing one arbitrary message from the generated history guarantees a saved ID that has not been loaded.
const bookmarksWithMissingMessage = fc.uniqueArray(fc.uuid(), { minLength: 3, maxLength: 20 }).chain((bookmarks) =>
  fc.integer({ min: 0, max: bookmarks.length - 1 }).map((missingIndex) => ({
    bookmarks,
    messages: bookmarks
      .filter((_, index) => index !== missingIndex)
      .toReversed()
      .map((id) => ({ id })),
    expected: bookmarks.filter((_, index) => index !== missingIndex),
  })),
)

// R1: /bookmarks shall preserve bookmark-addition order while omitting saved IDs whose messages are not loaded.
// Kind: Model / oracle
test("R1: missing messages are omitted without changing bookmark order", () => {
  fc.assert(
    fc.property(bookmarksWithMissingMessage, ({ bookmarks, messages, expected }) => {
      expect(bookmarkedMessages(bookmarks, messages).map((message) => message.id)).toEqual(expected)
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
        const stored = kv.get("session_bookmarks:session")
        return Array.isArray(stored) && stored.length === new Set(stored).size
      })
      expect(uniqueAfterEveryToggle).toBe(true)
    }),
  )
})

// Generated valid IDs are mixed with a duplicate and representative malformed persisted values.
const persistedBookmarkValues = fc.uniqueArray(fc.uuid(), { minLength: 1, maxLength: 20 }).map((ids) => ({
  expected: ids,
  stored: [...ids, ids[0], "", 0, null, false, { length: 1 }],
}))

// R4: Stored bookmark data shall normalize to unique, non-empty string message IDs.
// Kind: Model / oracle
test("R4: persisted bookmark values normalize to unique valid IDs", () => {
  fc.assert(
    fc.property(persistedBookmarkValues, ({ expected, stored }) => {
      const kv = memoryKV()
      kv.set("session_bookmarks:session", stored)
      expect(getBookmarks(kv, "session")).toEqual(expected)
    }),
  )
})

// Non-array values exercise corrupt, absent, or legacy storage without relying on one example value.
const nonArrayBookmarkValue = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.dictionary(fc.string(), fc.string()),
)

// R4: Non-list persisted values shall not produce bookmark entries.
// Kind: Invariant
test("R4: non-list persisted values produce no bookmarks", () => {
  fc.assert(
    fc.property(nonArrayBookmarkValue, (stored) => {
      const kv = memoryKV()
      kv.set("session_bookmarks:session", stored)
      expect(getBookmarks(kv, "session")).toEqual([])
    }),
  )
})

// R3: Bookmark state shall not be published before persistent storage is ready.
// Kind: Invariant
test("R3: toggling before storage is ready leaves bookmark state unchanged", () => {
  fc.assert(
    fc.property(fc.uuid(), (messageID) => {
      const kv = memoryKV(false)
      expect(toggleBookmark(kv, "session", messageID)).toBeUndefined()
      expect(kv.get("session_bookmarks:session")).toBeUndefined()
    }),
  )
})

// The generated boolean covers both an initially saved and an initially unsaved prompt.
const bookmarkAndInitialState = fc.tuple(fc.uuid(), fc.boolean())

// R3: A bookmark toggle shall immediately report the prompt's new saved state.
// Kind: Model / oracle
test("R3: toggle returns the updated bookmark state", () => {
  fc.assert(
    fc.property(bookmarkAndInitialState, ([messageID, initiallySaved]) => {
      const kv = memoryKV()
      if (initiallySaved) kv.set("session_bookmarks:session", [messageID])
      expect(toggleBookmark(kv, "session", messageID)).toBe(!initiallySaved)
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

// The last generated ID is absent from the initial list, so adding it exercises the other half of bookmark independence.
const independentBookmarkAddition = fc
  .uniqueArray(fc.uuid(), { minLength: 2, maxLength: 20 })
  .map(([added, ...bookmarks]) => ({ added, bookmarks }))

// R5: Adding a bookmark shall not remove or change any bookmark already in the session.
// Kind: Metamorphic
test("R5: adding one bookmark leaves existing bookmarks unchanged", () => {
  fc.assert(
    fc.property(independentBookmarkAddition, ({ added, bookmarks }) => {
      const kv = memoryKV()
      kv.set("session_bookmarks:session", bookmarks)
      toggleBookmark(kv, "session", added)
      expect(getBookmarks(kv, "session")).toEqual([...bookmarks, added])
    }),
  )
})
