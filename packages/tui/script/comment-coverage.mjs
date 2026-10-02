import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const directory = fileURLToPath(new URL("../", import.meta.url))
const result = await Bun.spawn(
  [
    "bun",
    "test",
    "test/comment-tests/comment.test.ts",
    "test/comment-tests/comment-output.test.ts",
    "test/app-lifecycle.test.tsx",
    "--coverage",
    "--coverage-reporter=lcov",
    "--coverage-dir=coverage/comment-index",
    "--timeout",
    "30000",
  ],
  { cwd: directory, stdout: "inherit", stderr: "inherit" },
).exited
if (result !== 0) process.exit(result)

// The Solid preload reports coverage for transformed JavaScript without a source
// map. Recreate its exact transform and map LCOV hits back to the original TSX.
const require = createRequire(import.meta.resolve("@opentui/solid"))
const { transformAsync } = require("@babel/core")
const { TraceMap, eachMapping } = require("@jridgewell/trace-mapping")
const filename = path.join(directory, "src/component/prompt/index.tsx")
const source = await Bun.file(filename).text()
const transformed = await transformAsync(source, {
  filename,
  configFile: false,
  babelrc: false,
  presets: [
    [require("babel-preset-solid"), { moduleName: "@opentui/solid", generate: "universal" }],
    [require("@babel/preset-typescript")],
  ],
  sourceMaps: true,
})
const { transformSolidSource } = await import(
  path.join(path.dirname(require.resolve("@opentui/solid")), "scripts/solid-transform.js")
)
if (transformed.code !== (await transformSolidSource(source, { filename }))) {
  throw new Error("Solid transform changed; update the coverage mapping before reporting coverage")
}

const record = (await Bun.file(path.join(directory, "coverage/comment-index/lcov.info")).text())
  .split("end_of_record")
  .find((record) => record.includes("SF:src/component/prompt/index.tsx\n"))
if (!record) throw new Error("No prompt/index.tsx coverage record was produced")
const generated = new Map(
  record
    .split("\n")
    .filter((line) => line.startsWith("DA:"))
    .map((line) => {
      const values = line.slice(3).split(",").map(Number)
      return [values[0], values[1]]
    }),
)
const original = new Map()
eachMapping(new TraceMap(transformed.map), (mapping) => {
  if (mapping.originalLine === null || !generated.has(mapping.generatedLine)) return
  original.set(
    mapping.originalLine,
    Math.max(original.get(mapping.originalLine) ?? 0, generated.get(mapping.generatedLine)),
  )
})

const lines = source.split("\n")
const lineOf = (text, from = 0) => {
  const index = lines.findIndex((line, index) => index >= from && line.includes(text))
  if (index === -1) throw new Error(`Cannot locate comment coverage boundary: ${text}`)
  return index + 1
}
const command = lineOf('title: "Comment selected code"')
const paste = lineOf("if (commentMode)")
const ranges = [
  [lineOf("let commentMode"), lineOf("let commentMode")],
  [command, lineOf('title: "Remove editor context"') - 3],
  [paste, lineOf("const normalizedText = text.replace", paste + 5) - 1],
  [lineOf("if (!pastedContent && !commentMode)"), lineOf("if (!pastedContent && !commentMode)")],
]
const selected = [...original]
  .filter(([line]) => ranges.some(([start, end]) => line >= start && line <= end))
  .sort(([a], [b]) => a - b)
if (!selected.length || ranges.some(([start, end]) => !selected.some(([line]) => line >= start && line <= end))) {
  throw new Error("Missing coverage mappings for a /comment code block")
}
const uncovered = selected.filter(([, hits]) => hits === 0).map(([line]) => line)
await Bun.write(
  path.join(directory, "coverage/comment-index/comment.lcov.info"),
  [
    "TN:comment",
    "SF:src/component/prompt/index.tsx",
    ...selected.map(([line, hits]) => `DA:${line},${hits}`),
    `LF:${selected.length}`,
    `LH:${selected.length - uncovered.length}`,
    "end_of_record",
    "",
  ].join("\n"),
)
console.log(
  `/comment in prompt/index.tsx: ${selected.length - uncovered.length}/${selected.length} source-mapped lines covered`,
)
if (uncovered.length) throw new Error(`Uncovered /comment lines: ${uncovered.join(", ")}`)
