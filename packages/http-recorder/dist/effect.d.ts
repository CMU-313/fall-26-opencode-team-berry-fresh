import * as Layer from "effect/Layer";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import type { RecorderOptions } from "./types.js";
/**
 * Provides a fetch-backed `HttpClient` with cassette recording and replay.
 *
 * Locally, a missing cassette is recorded from the real service. Existing
 * cassettes are replayed, and `CI=true` makes a missing cassette fail.
 */
export declare const http: (name: string, options?: RecorderOptions) => Layer.Layer<HttpClient.HttpClient>;
