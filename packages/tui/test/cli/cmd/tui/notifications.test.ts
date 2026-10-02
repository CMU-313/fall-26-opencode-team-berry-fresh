import { afterEach, describe, expect, setSystemTime, test } from "bun:test"
import Notifications from "../../../../src/feature-plugins/system/notifications"
import type {
  AssistantMessage,
  Event,
  Message,
  PermissionRequest,
  QuestionRequest,
  Session,
  UserMessage,
} from "@opencode-ai/sdk/v2"
import type { TuiAttentionNotifyInput, TuiPluginApi } from "@opencode-ai/plugin/tui"
import { createTuiPluginApi } from "../../../fixture/tui-plugin"

// `messages` seeds api.state.session.messages(sessionID), which drives the toast's "Took" / "Tokens used" stats
async function setup(messages: Record<string, Message[]> = {}) {
  const notifications: TuiAttentionNotifyInput[] = []
  const toasts: Parameters<TuiPluginApi["ui"]["toast"]>[0][] = []
  const rendererHandlers = new Map<string, () => void>()
  const handlers = new Map<Event["type"], ((event: Event) => void)[]>()
  const session = (id: string, title: string, parentID?: string): Session => ({
    id,
    title,
    slug: id,
    projectID: "project",
    directory: "/workspace",
    ...(parentID && { parentID }),
    version: "0.0.0-test",
    time: { created: 0, updated: 0 },
  })
  const sessions: Record<string, Session> = {
    session: session("session", "Demo session"),
    subagent: session("subagent", "Subagent session", "session"),
    abort: session("abort", "Abort session"),
    timeout: session("timeout", "Timeout session"),
    untitled: session("untitled", "New session - 2026-09-25T00:24:23.123Z"),
  }

  await Notifications.tui(
    createTuiPluginApi({
      // Capture renderer focus/blur handlers so tests can trigger them
      renderer: {
        on: (name: string, handler: () => void) => rendererHandlers.set(name, handler),
        off: (name: string) => rendererHandlers.delete(name),
      } as unknown as TuiPluginApi["renderer"],
      toast: (input) => toasts.push(input),
      attention: {
        async notify(input) {
          notifications.push(input)
          return { ok: true, notification: true, sound: true }
        },
      },
      event: {
        on: <Type extends Event["type"]>(type: Type, handler: (event: Extract<Event, { type: Type }>) => void) => {
          const list = handlers.get(type) ?? []
          const wrapped = handler as (event: Event) => void
          list.push(wrapped)
          handlers.set(type, list)
          return () => {
            handlers.set(
              type,
              (handlers.get(type) ?? []).filter((item) => item !== wrapped),
            )
          }
        },
      },
      state: {
        session: {
          get: (sessionID: string) => sessions[sessionID],
          messages: (sessionID: string) => messages[sessionID] ?? [],
        },
      },
    }),
    undefined,
    {} as never,
  )

  return {
    notifications,
    toasts,
    renderer: (name: "blur" | "focus") => rendererHandlers.get(name)?.(),
    emit,
    // Simulate one prompt turn: session goes busy, then idle
    run(sessionID: string) {
      emit({ id: "b", type: "session.status", properties: { sessionID, status: { type: "busy" } } })
      emit({ id: "i", type: "session.status", properties: { sessionID, status: { type: "idle" } } })
    },
  }

  function emit(event: Event) {
    for (const handler of handlers.get(event.type) ?? []) handler(event)
  }
}

function question(id: string, sessionID = "session"): QuestionRequest {
  return {
    id,
    sessionID,
    questions: [],
  }
}

function permission(id: string, sessionID = "session"): PermissionRequest {
  return {
    id,
    sessionID,
    permission: "edit",
    patterns: [],
    metadata: {},
    always: [],
  }
}

const questionNotification: TuiAttentionNotifyInput = {
  title: "Demo session",
  message: "Question needs input",
  notification: { when: "blurred" },
  sound: { name: "question", when: "always" },
}

const permissionNotification: TuiAttentionNotifyInput = {
  title: "Demo session",
  message: "Permission needs input",
  notification: { when: "blurred" },
  sound: { name: "permission", when: "always" },
}

describe("internal notifications TUI plugin", () => {
  test("notifies for question and permission requests with blurred notifications and always-on sounds", async () => {
    const harness = await setup()

    harness.emit({ id: "event-1", type: "question.asked", properties: question("question-1") })
    harness.emit({ id: "event-2", type: "permission.asked", properties: permission("permission-1") })

    expect(harness.notifications).toEqual([questionNotification, permissionNotification])
  })

  test("dedupes pending questions and permissions until they are resolved", async () => {
    const harness = await setup()

    harness.emit({ id: "event-1", type: "question.asked", properties: question("question-1") })
    harness.emit({ id: "event-2", type: "question.asked", properties: question("question-1") })
    harness.emit({
      id: "event-3",
      type: "question.replied",
      properties: { sessionID: "session", requestID: "question-1", answers: [] },
    })
    harness.emit({ id: "event-4", type: "question.asked", properties: question("question-1") })

    harness.emit({ id: "event-5", type: "permission.asked", properties: permission("permission-1") })
    harness.emit({ id: "event-6", type: "permission.asked", properties: permission("permission-1") })
    harness.emit({
      id: "event-7",
      type: "permission.replied",
      properties: { sessionID: "session", requestID: "permission-1", reply: "once" },
    })
    harness.emit({ id: "event-8", type: "permission.asked", properties: permission("permission-1") })

    expect(harness.notifications).toEqual([
      questionNotification,
      questionNotification,
      permissionNotification,
      permissionNotification,
    ])
  })

  test("notifies when an active session becomes idle and suppresses no-op idle", async () => {
    const harness = await setup()

    harness.emit({
      id: "event-1",
      type: "session.status",
      properties: { sessionID: "session", status: { type: "idle" } },
    })
    harness.emit({
      id: "event-2",
      type: "session.status",
      properties: { sessionID: "session", status: { type: "busy" } },
    })
    harness.emit({
      id: "event-3",
      type: "session.status",
      properties: { sessionID: "session", status: { type: "idle" } },
    })

    expect(harness.notifications).toEqual([
      {
        title: "Demo session",
        message: "OpenCode has finished responding",
        notification: { when: "blurred" },
        sound: { name: "done", when: "always" },
      },
    ])
  })

  test("falls back to an OpenCode title for untitled sessions", async () => {
    const harness = await setup()

    harness.emit({ id: "event-1", type: "question.asked", properties: question("question-1", "untitled") })

    expect(harness.notifications).toEqual([{ ...questionNotification, title: "OpenCode" }])
  })

  test("uses sound-only notifications and subagent_done sound for subagent sessions", async () => {
    const harness = await setup()

    harness.emit({ id: "event-1", type: "question.asked", properties: question("question-1", "subagent") })
    harness.emit({
      id: "event-2",
      type: "session.status",
      properties: { sessionID: "subagent", status: { type: "busy" } },
    })
    harness.emit({
      id: "event-3",
      type: "session.status",
      properties: { sessionID: "subagent", status: { type: "idle" } },
    })

    expect(harness.notifications).toEqual([
      {
        title: "Subagent session",
        message: "Question needs input",
        notification: false,
        sound: { name: "question", when: "always" },
      },
      {
        title: "Subagent session",
        message: "OpenCode has finished responding",
        notification: false,
        sound: { name: "subagent_done", when: "always" },
      },
    ])
  })

  test("notifies session errors once and suppresses the following idle done notification", async () => {
    const harness = await setup()

    harness.emit({
      id: "event-1",
      type: "session.status",
      properties: { sessionID: "session", status: { type: "busy" } },
    })
    harness.emit({
      id: "event-2",
      type: "session.error",
      properties: { sessionID: "session", error: { name: "UnknownError", data: { message: "boom" } } },
    })
    harness.emit({
      id: "event-3",
      type: "session.status",
      properties: { sessionID: "session", status: { type: "idle" } },
    })

    expect(harness.notifications).toEqual([
      {
        title: "Demo session",
        message: "Session error",
        notification: { when: "blurred" },
        sound: { name: "error", when: "always" },
      },
    ])
  })

  test("special-cases aborts and model response timeouts", async () => {
    const harness = await setup()

    harness.emit({
      id: "event-1",
      type: "session.status",
      properties: { sessionID: "abort", status: { type: "busy" } },
    })
    harness.emit({
      id: "event-2",
      type: "session.error",
      properties: { sessionID: "abort", error: { name: "MessageAbortedError", data: { message: "Aborted" } } },
    })
    harness.emit({
      id: "event-3",
      type: "session.status",
      properties: { sessionID: "timeout", status: { type: "busy" } },
    })
    harness.emit({
      id: "event-4",
      type: "session.error",
      properties: { sessionID: "timeout", error: { name: "UnknownError", data: { message: "SSE read timed out" } } },
    })

    expect(harness.notifications).toEqual([
      {
        title: "Abort session",
        message: "Session aborted",
        notification: { when: "blurred" },
        sound: { name: "error", when: "always" },
      },
      {
        title: "Timeout session",
        message: "Model stopped responding",
        notification: { when: "blurred" },
        sound: { name: "error", when: "always" },
      },
    ])
  })
})

function user(id: string, created: number): UserMessage {
  return {
    id,
    sessionID: "session",
    role: "user",
    time: { created },
    agent: "build",
    model: { providerID: "test", modelID: "test" },
  }
}

function assistant(
  id: string,
  parentID: string,
  input: { completed?: number; output?: number; reasoning?: number; tokensIn?: number } = {},
): AssistantMessage {
  return {
    id,
    sessionID: "session",
    role: "assistant",
    time: { created: 0, ...(input.completed !== undefined && { completed: input.completed }) },
    parentID,
    modelID: "test",
    providerID: "test",
    mode: "build",
    agent: "build",
    path: { cwd: "/workspace", root: "/workspace" },
    cost: 0,
    tokens: {
      input: input.tokensIn ?? 0,
      output: input.output ?? 0,
      reasoning: input.reasoning ?? 0,
      cache: { read: 0, write: 0 },
    },
  }
}

// Finish one turn of "session" while unfocused and return the stats lines of the only toast,
// i.e. everything after "OpenCode has finished responding" and "Finished at ..."
async function toastStats(messages: Message[]) {
  const harness = await setup({ session: messages })
  harness.renderer("blur")
  harness.run("session")
  expect(harness.toasts).toHaveLength(1)
  return harness.toasts[0].message.split("\n").slice(2)
}

describe("toast visibility: only while the terminal is unfocused", () => {
  test("[focus] focused by default (no focus/blur event yet): no toast, but attention notification still fires", async () => {
    const harness = await setup()
    harness.run("session")
    expect(harness.toasts).toEqual([])
    expect(harness.notifications).toHaveLength(1)
  })

  test("[focus] blurred: a top-level session finishing shows exactly one toast", async () => {
    const harness = await setup()
    harness.renderer("blur")
    harness.run("session")
    expect(harness.toasts).toHaveLength(1)
    expect(harness.toasts[0]).toMatchObject({ variant: "success", title: "Demo session", duration: 300_000 })
  })

  // "busy" / "idle" are session.status events for "session"; "blur" / "focus" are terminal focus changes
  const cases = [
    { name: "blurred then refocused before finishing: no toast", steps: ["blur", "focus", "busy", "idle"], toasts: 0 },
    {
      name: "only the latest focus state counts (focus -> blur -> focus -> blur): toast",
      steps: ["focus", "blur", "focus", "blur", "busy", "idle"],
      toasts: 1,
    },
    {
      // Starts focused and finishes blurred -> toast; starts blurred and finishes focused -> no toast
      name: "focus state is read when the session finishes, not when it starts",
      steps: ["busy", "blur", "idle", "busy", "focus", "idle"],
      toasts: 1,
    },
  ] as const

  for (const item of cases) {
    test(`[focus] ${item.name}`, async () => {
      const harness = await setup()
      for (const step of item.steps) {
        if (step === "blur" || step === "focus") harness.renderer(step)
        if (step === "busy")
          harness.emit({
            id: step,
            type: "session.status",
            properties: { sessionID: "session", status: { type: "busy" } },
          })
        if (step === "idle")
          harness.emit({
            id: step,
            type: "session.status",
            properties: { sessionID: "session", status: { type: "idle" } },
          })
      }
      expect(harness.toasts).toHaveLength(item.toasts)
    })
  }
})

describe("toast content", () => {
  afterEach(() => setSystemTime())

  test("[content] second line is 'Finished at <current time>' (clock pinned to 14:05)", async () => {
    setSystemTime(new Date(2026, 0, 1, 14, 5, 30))
    const harness = await setup()
    harness.renderer("blur")
    harness.run("session")
    const lines = harness.toasts[0].message.split("\n")
    expect(lines[0]).toBe("OpenCode has finished responding")
    // Locale decides 12h ("2:05 PM") vs 24h ("14:05"); either way hour + minute, no seconds
    expect(lines[1]).toMatch(/^Finished at (2|14):05(\s?[AP]M)?$/i)
  })
})

describe("toast stats: 'Took' duration", () => {
  // Duration = last completed reply's time.completed - latest user prompt's time.created.
  // Covers: zero, rounding boundary at 0.5s, seconds/minutes boundary at 60s, minutes + seconds, and negative clamp.
  const durations = [
    { ms: 0, expected: "Took 0s" },
    { ms: 499, expected: "Took 0s" },
    { ms: 500, expected: "Took 1s" },
    { ms: 59_499, expected: "Took 59s" },
    { ms: 59_500, expected: "Took 1m 0s" },
    { ms: 125_000, expected: "Took 2m 5s" },
    { ms: -5_000, expected: "Took 0s" },
  ]
  const cases = [
    ...durations.map((item) => ({
      name: `${item.ms}ms -> "${item.expected}"`,
      messages: [user("u1", 10_000), assistant("a1", "u1", { completed: 10_000 + item.ms })],
      expected: [item.expected],
    })),
    {
      name: "multiple replies: duration ends at the last completed reply",
      messages: [
        user("u1", 0),
        assistant("a1", "u1", { completed: 5_000 }),
        assistant("a2", "u1", { completed: 42_000 }),
      ],
      expected: ["Took 42s"],
    },
    {
      name: "last reply still incomplete: falls back to the last reply that did complete",
      messages: [user("u1", 0), assistant("a1", "u1", { completed: 7_000 }), assistant("a2", "u1")],
      expected: ["Took 7s"],
    },
    {
      name: "assistant messages without any user prompt: no stats",
      messages: [assistant("a1", "u-missing", { completed: 5_000, output: 10 })],
      expected: [],
    },
  ]

  for (const item of cases) {
    test(`[stats] ${item.name}`, async () => {
      expect(await toastStats(item.messages)).toEqual(item.expected)
    })
  }
})

describe("toast stats: 'Tokens used'", () => {
  const cases = [
    {
      name: "minimum non-zero (1 token) is shown",
      messages: [user("u1", 0), assistant("a1", "u1", { completed: 1_000, output: 1 })],
      expected: ["Took 1s", "Tokens used: 1"],
    },
    {
      name: "input tokens are not counted",
      messages: [user("u1", 0), assistant("a1", "u1", { completed: 1_000, tokensIn: 5_000, output: 10 })],
      expected: ["Took 1s", "Tokens used: 10"],
    },
    {
      name: "tokens are summed across all replies to the latest prompt, including incomplete ones",
      messages: [
        user("u1", 0),
        assistant("a1", "u1", { completed: 2_000, output: 100, reasoning: 50 }),
        assistant("a2", "u1", { output: 25 }),
      ],
      expected: ["Took 2s", "Tokens used: 175"],
    },
    {
      name: "tokens from earlier prompts are excluded",
      messages: [
        user("u1", 0),
        assistant("a1", "u1", { completed: 1_000, output: 9_999 }),
        user("u2", 10_000),
        assistant("a2", "u2", { completed: 11_000, output: 7 }),
      ],
      expected: ["Took 1s", "Tokens used: 7"],
    },
    {
      name: "tokens but no completed reply: only the tokens line is shown",
      messages: [user("u1", 0), assistant("a1", "u1", { output: 42 })],
      expected: ["Tokens used: 42"],
    },
  ]

  for (const item of cases) {
    test(`[stats] ${item.name}`, async () => {
      expect(await toastStats(item.messages)).toEqual(item.expected)
    })
  }

  test("[stats] output only / reasoning only / both are counted", async () => {
    const counts = [
      { output: 120, reasoning: 0, expected: "Tokens used: 120" },
      { output: 0, reasoning: 80, expected: "Tokens used: 80" },
      { output: 120, reasoning: 80, expected: "Tokens used: 200" },
    ]
    for (const item of counts) {
      const messages = [
        user("u1", 0),
        assistant("a1", "u1", { completed: 1_000, output: item.output, reasoning: item.reasoning }),
      ]
      expect(await toastStats(messages)).toEqual(["Took 1s", item.expected])
    }
  })
})
