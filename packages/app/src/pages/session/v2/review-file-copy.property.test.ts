import { describe, expect, test } from "bun:test"
import { copyReviewFilePath } from "./review-file-copy"
import * as fc from "fast-check"
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

fc.configureGlobal({ seed: 42 })
// Generate valid path segments with spaces, punctuation, and Unicode.
const segment = fc
  .array(fc.constantFrom("a", "Z", "0", "-", "_", " ", "é"), { maxLength: 8 })
  .map((characters) => `x${characters.join("")}z`)

// Zero folders gives a root-level file. More folders exercise nested paths.
const folders = fc.array(segment, { maxLength: 3 })
const filename = segment.map((name) => `${name}.ts`)
const relativePath = fc
  .tuple(folders, filename)
  .map(([directories, name]) => [...directories, name].join("/"))

function makeClipboard() {
  let text = "previous clipboard contents"

  return {
    read: () => text,
    copy: (path: string, succeeds = true) =>
      copyReviewFilePath(path, {
        writeText: async (value) => {
          if (!succeeds) throw new Error("clipboard unavailable")
          text = value
        },
        onSuccess: () => {},
        onFailure: () => {},
      }),
  }
}

async function withTestFile(
  relative: string,
  contents: string,
  check: (root: string, file: string) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), "review-file-copy-"))
  try {
    const file = join(root, relative)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, contents)
    await check(root, file)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe("copyReviewFilePath properties", () => {
  // R1: Copying a file's path must preserve the file's contents.
  // Kind: invariant.
  // Vary file contents and location. Check both clipboard outcomes per input.
  test("R1: copying preserves file contents", async () => {
    await fc.assert(
      fc.asyncProperty(relativePath, fc.string({ maxLength: 200 }), async (path, contents) => {
        await withTestFile(path, contents, async (_root, file) => {
          const before = await readFile(file)
          const clipboard = makeClipboard()

          for (const succeeds of [true, false]) {
            expect(await clipboard.copy(file, succeeds)).toBe(succeeds)
            expect(await readFile(file)).toEqual(before)
          }
        })
      }),
    )
  })

  // R2: A successful copy must replace the clipboard with the selected path.
  // Kind: model/oracle.
  // Generate distinct paths by prefix and always exercise A → B → A.
  test("R2: the clipboard holds the latest successfully copied path", async () => {
    await fc.assert(
      fc.asyncProperty(relativePath, relativePath, async (first, second) => {
        const clipboard = makeClipboard()
        const a = `first/${first}`
        const b = `second/${second}`

        for (const expected of [a, b, a]) {
          expect(await clipboard.copy(expected)).toBe(true)
          expect(clipboard.read()).toBe(expected)
        }
      }),
    )
  })

  // R3: Copying a file's path must preserve its original name and location.
  // Kind: invariant.
  // Vary the name and directory depth. Check both clipboard outcomes per input.
  test("R3: copying preserves the original file path", async () => {
    await fc.assert(
      fc.asyncProperty(relativePath, async (path) => {
        await withTestFile(path, "fixture", async (root, file) => {
          const before = (await readdir(root, { recursive: true })).sort()
          const clipboard = makeClipboard()

          for (const succeeds of [true, false]) {
            expect(await clipboard.copy(file, succeeds)).toBe(succeeds)
            expect((await readdir(root, { recursive: true })).sort()).toEqual(before)
          }
        })
      }),
    )
  })

  // R4: Copied paths for files with identical names must retain the directory
  // information needed to distinguish them.
  // Kind: metamorphic.
  // Hold the generated filename and subfolders fixed while changing the top folder.
  test("R4: changing the directory changes the copied path", async () => {
    await fc.assert(
      fc.asyncProperty(folders, filename, async (directories, name) => {
        const clipboard = makeClipboard()
        const suffix = [...directories, name].join("/")
        const firstPath = `src/${suffix}`
        const secondPath = `tests/${suffix}`

        expect(await clipboard.copy(firstPath)).toBe(true)
        const firstCopy = clipboard.read()
        expect(firstCopy).toBe(firstPath)

        expect(await clipboard.copy(secondPath)).toBe(true)
        expect(clipboard.read()).toBe(secondPath)
        expect(clipboard.read()).toBe(`tests/${firstCopy.slice("src/".length)}`)
      }),
    )
  })

  // R6: Copy feedback matches the clipboard outcome.
  // Kind: conditional.
  test("R6: copy calls only the matching feedback callback", async () => {
    await fc.assert(
      fc.asyncProperty(relativePath, async (path) => {
        for (const succeeds of [true, false]) {
          const successes: string[] = []
          const failures: string[] = []

          const result = await copyReviewFilePath(path, {
            writeText: async () => {
              if (!succeeds) throw new Error("clipboard unavailable")
            },
            onSuccess: (value) => {
              successes.push(value)
            },
            onFailure: (value) => {
              failures.push(value)
            },
          })

          expect(result).toBe(succeeds)
          expect(successes).toEqual(succeeds ? [path] : [])
          expect(failures).toEqual(succeeds ? [] : [path])
        }
      }),
    )
  })

  // R2: Preserve the exact path and retain clipboard state after failure.
  // Kind: model/oracle.
  test("R2: successful copy replaces clipboard, failure preserves current state", async () => {
    await fc.assert(
      fc.asyncProperty(
        relativePath,
        fc.integer({ min: 1, max: 3 }),
        async (path, spaces) => {
          const clipboard = makeClipboard()
          const selectedPath = `base/${path}${" ".repeat(spaces)}`
          let expectedClipboard = clipboard.read()

          for (const succeeds of [true, false]) {
            const result = await clipboard.copy(selectedPath, succeeds)

            if (succeeds) expectedClipboard = selectedPath

            expect(result).toBe(succeeds)
            expect(clipboard.read()).toBe(expectedClipboard)
          }
        },
      ),
    )
  })

})