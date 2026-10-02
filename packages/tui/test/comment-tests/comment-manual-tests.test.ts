import { describe, expect, test } from "bun:test"

/*
Manual /comment checks:
1. Start the OpenCode server and open its interface in this repository.
2. Copy one complete function below, including its original indentation.
3. Select /comment in the interface, then paste the copied function.
4. Check that OpenCode inserts a concise TypeScript comment above that function,
   describes its actual behavior, and leaves the function and other examples unchanged.
5. Repeat with the other functions. Invoke /comment and paste whitespace to check
   that "No code pasted" appears without changing this file.
6. Run `bun test test/comment-tests/comment-manual-tests.test.ts` from packages/tui after edits.
   These tests check function behavior; generated comment quality is checked manually.
*/

export function calculateTotal(items: { price: number; quantity: number }[]) {
  return items.reduce((total, item) => total + item.price * item.quantity, 0)
}

export function activeEmails(users: { email: string; active: boolean }[]) {
  return users.filter((user) => user.active).map((user) => user.email)
}

export function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "Invalid duration"
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`
}

export function uniqueTags(tags: string[]) {
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter((tag) => tag.length > 0))]
}

export function describeStock(quantity: number) {
  if (quantity <= 0) return "Out of stock"
  if (quantity < 5) return "Low stock"
  return "In stock"
}

describe("manual /comment example behavior", () => {
  // Verifies calculateTotal sums price × quantity per item and returns 0 for empty input.
  test("calculateTotal sums prices multiplied by quantities", () => {
    expect(
      calculateTotal([
        { price: 10, quantity: 2 },
        { price: 5, quantity: 3 },
      ]),
    ).toBe(35)
    expect(calculateTotal([])).toBe(0)
  })

  // Verifies activeEmails filters to active users and projects their emails, preserving input order.
  test("activeEmails returns only active users' emails in input order", () => {
    expect(
      activeEmails([
        { email: "first@example.com", active: true },
        { email: "disabled@example.com", active: false },
        { email: "last@example.com", active: true },
      ]),
    ).toEqual(["first@example.com", "last@example.com"])
    expect(activeEmails([])).toEqual([])
  })

  // Verifies formatDuration converts total seconds to "M:SS" and rejects negative, NaN, and Infinite values.
  test("formatDuration formats minutes and seconds and rejects invalid durations", () => {
    expect(formatDuration(0)).toBe("0:00")
    expect(formatDuration(125.9)).toBe("2:05")
    expect(formatDuration(-1)).toBe("Invalid duration")
    expect(formatDuration(Number.NaN)).toBe("Invalid duration")
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("Invalid duration")
  })

  // Normalization happens before deduplication; first occurrence order is preserved.
  test("uniqueTags normalizes tags, discards blanks, and removes duplicates", () => {
    expect(uniqueTags([" Bun ", "typescript", "BUN", " ", "TypeScript", "testing"])).toEqual([
      "bun",
      "typescript",
      "testing",
    ])
    expect(uniqueTags([])).toEqual([])
  })

  // Boundary inputs help check that a generated description states the correct thresholds.
  test("describeStock distinguishes unavailable, low, and sufficient inventory", () => {
    expect(describeStock(-1)).toBe("Out of stock")
    expect(describeStock(0)).toBe("Out of stock")
    expect(describeStock(1)).toBe("Low stock")
    expect(describeStock(4)).toBe("Low stock")
    expect(describeStock(5)).toBe("In stock")
  })
})
