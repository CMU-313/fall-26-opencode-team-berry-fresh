import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { expect, test } from "bun:test"
import path from "node:path"
import { buildCommentPrompt } from "../../src/component/prompt/comment"
import { commentExamples, requireCommentOutput } from "../fixture/comment-output"
import { tmpdir } from "../fixture/fixture"

const enabled = process.env.OPENCODE_COMMENT_LIVE === "true"
const url = process.env.OPENCODE_COMMENT_TEST_URL
const model = process.env.OPENCODE_COMMENT_TEST_MODEL
if (enabled && (!url || !model?.includes("/"))) {
  throw new Error("Live comment tests require OPENCODE_COMMENT_TEST_URL and OPENCODE_COMMENT_TEST_MODEL=provider/model")
}

// Exercise OpenCode's actual model and editing tools, not a replacement response.
// The server must run locally with access to these temporary files and configured credentials.
test.skipIf(!enabled).each([...commentExamples])("live /comment generates a descriptive $language comment", async (example) => {
  await using workspace = await tmpdir()
  const file = path.join(workspace.path, example.file)
  await Bun.write(file, example.code)
  await Bun.write(path.join(workspace.path, "unrelated.txt"), "This file must stay unchanged.\n")
  const client = createOpencodeClient({ baseUrl: url, directory: workspace.path, throwOnError: true })
  const session = await client.session.create({
    title: `Comment acceptance: ${example.language}`,
    permission: [{ permission: "*", pattern: "*", action: "allow" }],
  })
  if (!session.data) throw new Error("OpenCode did not create a test session")
  const providerID = model!.slice(0, model!.indexOf("/"))
  const modelID = model!.slice(model!.indexOf("/") + 1)
  try {
    const response = await client.session.prompt({
      sessionID: session.data.id,
      agent: "build",
      model: { providerID, modelID },
      parts: [{ type: "text", text: buildCommentPrompt(example.code, workspace.path, file) }],
    }, { signal: AbortSignal.timeout(110_000) })
    expect(response.data?.info.error).toBeUndefined()
    expect(requireCommentOutput(await Bun.file(file).text(), example)).not.toBeEmpty()
    expect(await Bun.file(path.join(workspace.path, "unrelated.txt")).text()).toBe("This file must stay unchanged.\n")
  } finally {
    await client.session.abort({ sessionID: session.data.id })
    await client.session.delete({ sessionID: session.data.id })
  }
}, 120_000)
