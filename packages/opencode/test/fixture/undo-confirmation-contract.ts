// A test-only transport keeps the UI's TypeScript project and environment
// independent of the server's aliases and process-global database/config state.
import { Schema } from "effect"

export const Setup = Schema.Struct({
  prompt: Schema.String,
  contents: Schema.Array(Schema.String),
  mode: Schema.Literals(["modified", "read-only", "conflict"]),
})
export const Reply = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("ready"),
    directory: Schema.String,
    promptID: Schema.String,
    messages: Schema.Array(Schema.Struct({ id: Schema.String, text: Schema.String })),
  }),
  Schema.Struct({
    type: Schema.Literal("result"),
    messageID: Schema.optional(Schema.String),
    error: Schema.optional(
      Schema.Struct({
        _tag: Schema.Literal("UndoConflictError"),
        conflicts: Schema.mutable(
          Schema.Array(
            Schema.Struct({
              file: Schema.String,
              action: Schema.Literals(["restore", "delete"]),
              token: Schema.String,
            }),
          ),
        ),
      }),
    ),
  }),
  Schema.Struct({ type: Schema.Literal("disposed") }),
])
