import type { AssistantMessage, Event } from "@opencode-ai/sdk/v2"
import type { TuiAttentionSoundName, TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { BuiltinTuiPlugin } from "../builtins"
import { isDefaultTitle } from "../../util/session"

const id = "internal:notifications"

type SessionError = Extract<Event, { type: "session.error" }>["properties"]["error"]

// Untitled sessions carry a long timestamped placeholder title, which is noise in a notification
function displayTitle(title: string | undefined) {
  return title && !isDefaultTitle(title) ? title : undefined
}

function notify(api: TuiPluginApi, sessionID: string | undefined, message: string, sound: TuiAttentionSoundName) {
  const session = sessionID ? api.state.session.get(sessionID) : undefined
  const isSubagent = session?.parentID !== undefined
  void api.attention.notify({
    title: displayTitle(session?.title) ?? "OpenCode",
    message,
    notification: isSubagent ? false : { when: "blurred" },
    sound: { name: sound, when: "always" },
  })
}

// Compute time and tokens for the latest prompt only
function turnSummary(api: TuiPluginApi, sessionID: string) {
  const messages = api.state.session.messages(sessionID)
  const prompt = messages.findLast((item) => item.role === "user")
  const replies = messages.filter(
    (item): item is AssistantMessage => item.role === "assistant" && item.parentID === prompt?.id,
  )
  const end = replies.findLast((item) => item.time.completed)?.time.completed
  const tokens = replies.reduce((sum, item) => sum + item.tokens.output + item.tokens.reasoning, 0)
  return [
    ...(prompt && end !== undefined ? [`Took ${formatDuration(end - prompt.time.created)}`] : []),
    ...(tokens > 0 ? [`Tokens used: ${tokens.toLocaleString()}`] : []),
  ]
}

function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function sessionErrorMessage(error: SessionError) {
  if (error?.name === "MessageAbortedError") return "Session aborted"
  const data = error?.data
  if (data && typeof data === "object" && "message" in data && data.message === "SSE read timed out") {
    return "Model stopped responding"
  }
  return "Session error"
}

const tui: TuiPlugin = async (api) => {
  const active = new Set<string>()
  const errored = new Set<string>()
  const questions = new Set<string>()
  const permissions = new Set<string>()

  // Track terminal focus so toasts only show when the user is away
  let blurred = false
  const onBlur = () => {
    blurred = true
  }
  const onFocus = () => {
    blurred = false
  }
  api.renderer.on("blur", onBlur)
  api.renderer.on("focus", onFocus)
  // Remove focus listeners when the plugin is disposed
  api.lifecycle.onDispose(() => {
    api.renderer.off("blur", onBlur)
    api.renderer.off("focus", onFocus)
  })

  api.event.on("question.asked", (event) => {
    if (questions.has(event.properties.id)) return
    questions.add(event.properties.id)
    notify(api, event.properties.sessionID, "Question needs input", "question")
  })

  api.event.on("question.replied", (event) => {
    questions.delete(event.properties.requestID)
  })

  api.event.on("question.rejected", (event) => {
    questions.delete(event.properties.requestID)
  })

  api.event.on("permission.asked", (event) => {
    if (permissions.has(event.properties.id)) return
    permissions.add(event.properties.id)
    notify(api, event.properties.sessionID, "Permission needs input", "permission")
  })

  api.event.on("permission.replied", (event) => {
    permissions.delete(event.properties.requestID)
  })

  api.event.on("session.status", (event) => {
    const sessionID = event.properties.sessionID
    if (event.properties.status.type === "busy" || event.properties.status.type === "retry") {
      active.add(sessionID)
      errored.delete(sessionID)
      return
    }

    if (event.properties.status.type !== "idle") return
    if (!active.has(sessionID)) return
    active.delete(sessionID)

    if (errored.has(sessionID)) {
      errored.delete(sessionID)
      return
    }

    const session = api.state.session.get(sessionID)
    notify(api, sessionID, "OpenCode has finished responding", session?.parentID ? "subagent_done" : "done")
    // Only toast for top-level sessions that finish while the terminal is unfocused
    if (!blurred || session?.parentID) return
    const time = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    api.ui.toast({
      variant: "success",
      title: displayTitle(session?.title),
      message: [`OpenCode has finished responding`, `Finished at ${time}`, ...turnSummary(api, sessionID)].join("\n"),
      duration: 300_000,
    })
  })

  api.event.on("session.error", (event) => {
    const sessionID = event.properties.sessionID
    if (!sessionID) return
    if (!active.has(sessionID)) return
    errored.add(sessionID)
    notify(api, sessionID, sessionErrorMessage(event.properties.error), "error")
  })
}

const plugin: BuiltinTuiPlugin = {
  id,
  tui,
}

export default plugin
