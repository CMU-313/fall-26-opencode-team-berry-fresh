// This module must precede UI imports: Global caches XDG paths on first import.
// Keep UI locks/config, child databases, and generated projects out of user data.
import { afterAll } from "bun:test"
import { mkdtempSync, mkdirSync } from "node:fs"
import { rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

export const undoTestRoot = mkdtempSync(path.join(os.tmpdir(), "opencode-r5-"))
for (const [name, directory] of Object.entries({
  XDG_DATA_HOME: "data",
  XDG_CONFIG_HOME: "config",
  XDG_STATE_HOME: "state",
  XDG_CACHE_HOME: "cache",
  OPENCODE_TEST_HOME: "home",
  OPENCODE_TEST_MANAGED_CONFIG_DIR: "managed",
})) {
  process.env[name] = path.join(undoTestRoot, directory)
  mkdirSync(process.env[name]!, { recursive: true })
}
afterAll(() => rm(undoTestRoot, { recursive: true, force: true }))
