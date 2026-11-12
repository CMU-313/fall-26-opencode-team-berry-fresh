// src/effect.ts
import { NodeFileSystem as NodeFileSystem2 } from "@effect/platform-node";
import * as Layer3 from "effect/Layer";
import { FetchHttpClient as FetchHttpClient2 } from "effect/unstable/http";

// src/cassette.ts
import { Context, Effect, FileSystem, Layer, Schema as Schema3, Semaphore } from "effect";
import * as path from "node:path";

// src/redaction.ts
import { Schema } from "effect";
var REDACTED = "[REDACTED]";
var DEFAULT_REDACT_HEADERS = [
  "authorization",
  "cookie",
  "proxy-authorization",
  "set-cookie",
  "x-api-key",
  "x-amz-security-token",
  "x-goog-api-key"
];
var DEFAULT_REDACT_QUERY = [
  "access_token",
  "api-key",
  "api_key",
  "apikey",
  "code",
  "key",
  "signature",
  "sig",
  "token",
  "x-amz-credential",
  "x-amz-security-token",
  "x-amz-signature"
];
var SECRET_PATTERNS = [
  { label: "bearer token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/i },
  { label: "API key", pattern: /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{20,}\b/ },
  { label: "Anthropic API key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { label: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{20,}\b/ },
  { label: "AWS access key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { label: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
  { label: "private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ }
];
var ENV_SECRET_NAMES = /(?:API|AUTH|BEARER|CREDENTIAL|KEY|PASSWORD|SECRET|TOKEN)/i;
var SAFE_ENV_VALUES = new Set(["fixture", "test", "test-key"]);
var envSecrets = () => Object.entries(process.env).flatMap(([name, value]) => {
  if (!value)
    return [];
  if (!ENV_SECRET_NAMES.test(name))
    return [];
  if (value.length < 12)
    return [];
  if (SAFE_ENV_VALUES.has(value.toLowerCase()))
    return [];
  return [{ name, value }];
});
var pathFor = (base, key) => base ? `${base}.${key}` : key;
var stringEntries = (value, base = "") => {
  if (typeof value === "string")
    return [{ path: base, value }];
  if (Array.isArray(value))
    return value.flatMap((item, index) => stringEntries(item, `${base}[${index}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => stringEntries(child, pathFor(base, key)));
  }
  return [];
};
var redactionSet = (values, defaults) => new Set([...defaults, ...values ?? []].map((value) => value.toLowerCase()));
var redactUrl = (raw, query = DEFAULT_REDACT_QUERY, urlRedactor) => {
  if (!URL.canParse(raw))
    return urlRedactor?.(raw) ?? raw;
  const url = new URL(raw);
  if (url.username)
    url.username = REDACTED;
  if (url.password)
    url.password = REDACTED;
  const redacted = redactionSet(query, DEFAULT_REDACT_QUERY);
  for (const key of url.searchParams.keys()) {
    if (redacted.has(key.toLowerCase()))
      url.searchParams.set(key, REDACTED);
  }
  return urlRedactor?.(url.toString()) ?? url.toString();
};
var redactHeaders = (headers, allow, redact = DEFAULT_REDACT_HEADERS) => {
  const allowed = new Set(allow.map((name) => name.toLowerCase()));
  const redacted = redactionSet(redact, DEFAULT_REDACT_HEADERS);
  return Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]).filter(([name]) => allowed.has(name)).map(([name, value]) => [name, redacted.has(name) ? REDACTED : value]).toSorted(([a], [b]) => a.localeCompare(b)));
};
var SecretFindingSchema = Schema.Struct({
  path: Schema.String,
  reason: Schema.String
});
var secretFindings = (value) => {
  const environment = envSecrets();
  return stringEntries(value).flatMap((entry) => [
    ...SECRET_PATTERNS.filter((item) => item.pattern.test(entry.value)).map((item) => ({
      path: entry.path,
      reason: item.label
    })),
    ...environment.filter((item) => entry.value.includes(item.value)).map((item) => ({ path: entry.path, reason: `environment secret ${item.name}` }))
  ]);
};

// src/schema.ts
import { Schema as Schema2 } from "effect";
var RequestSnapshotSchema = Schema2.Struct({
  method: Schema2.String,
  url: Schema2.String,
  headers: Schema2.Record(Schema2.String, Schema2.String),
  body: Schema2.String
});
var ResponseSnapshotSchema = Schema2.Struct({
  status: Schema2.Number,
  headers: Schema2.Record(Schema2.String, Schema2.String),
  body: Schema2.String,
  bodyEncoding: Schema2.optional(Schema2.Literals(["text", "base64"]))
});
var CassetteMetadataSchema = Schema2.Record(Schema2.String, Schema2.Unknown);
var HttpInteractionSchema = Schema2.Struct({
  transport: Schema2.tag("http"),
  request: RequestSnapshotSchema,
  response: ResponseSnapshotSchema
});
var WebSocketEventSchema = Schema2.Union([
  Schema2.Struct({
    direction: Schema2.Literals(["client", "server"]),
    kind: Schema2.tag("text"),
    body: Schema2.String
  }),
  Schema2.Struct({
    direction: Schema2.Literals(["client", "server"]),
    kind: Schema2.tag("binary"),
    body: Schema2.String,
    bodyEncoding: Schema2.Literal("base64")
  })
]);
var WebSocketInteractionSchema = Schema2.Struct({
  transport: Schema2.tag("websocket"),
  open: Schema2.Struct({
    url: Schema2.String,
    headers: Schema2.Record(Schema2.String, Schema2.String)
  }),
  events: Schema2.Array(WebSocketEventSchema)
});
var InteractionSchema = Schema2.Union([HttpInteractionSchema, WebSocketInteractionSchema]).pipe(Schema2.toTaggedUnion("transport"));
var isHttpInteraction = InteractionSchema.guards.http;
var isWebSocketInteraction = InteractionSchema.guards.websocket;
var httpInteractions = (interactions) => interactions.filter(isHttpInteraction);
var webSocketInteractions = (interactions) => interactions.filter(isWebSocketInteraction);
var CassetteSchema = Schema2.Struct({
  version: Schema2.Literal(1),
  metadata: Schema2.optional(CassetteMetadataSchema),
  interactions: Schema2.Array(InteractionSchema)
});
var decodeCassette = Schema2.decodeUnknownSync(CassetteSchema);
var encodeCassette = Schema2.encodeSync(CassetteSchema);

// src/cassette.ts
var DEFAULT_RECORDINGS_DIR = path.resolve(process.cwd(), "test", "fixtures", "recordings");

class CassetteNotFoundError extends Schema3.TaggedErrorClass()("CassetteNotFoundError", {
  cassetteName: Schema3.String
}) {
  get message() {
    return `Cassette "${this.cassetteName}" not found`;
  }
}

class UnsafeCassetteError extends Schema3.TaggedErrorClass()("UnsafeCassetteError", {
  cassetteName: Schema3.String,
  findings: Schema3.Array(SecretFindingSchema)
}) {
  get message() {
    return `Refusing to write cassette "${this.cassetteName}" because it contains possible secrets: ${this.findings.map((finding) => `${finding.path} (${finding.reason})`).join(", ")}`;
  }
}

class Service extends Context.Service()("@opencode-ai/http-recorder/Cassette") {
}
var cassettePath = (directory, name) => {
  if (!name || path.isAbsolute(name) || path.win32.isAbsolute(name) || name.split(/[\\/]/).includes(".."))
    throw new Error(`Invalid cassette name "${name}"`);
  const root = path.resolve(directory);
  const target = path.resolve(root, `${name}.json`);
  const relative2 = path.relative(root, target);
  if (!relative2 || relative2.startsWith("..") || path.isAbsolute(relative2))
    throw new Error(`Invalid cassette name "${name}"`);
  return target;
};
var buildCassette = (name, interactions, metadata) => ({
  version: 1,
  metadata: { name, recordedAt: new Date().toISOString(), ...metadata },
  interactions
});
var formatCassette = (cassette) => `${JSON.stringify(encodeCassette(cassette), null, 2)}
`;
var parseCassette = Schema3.decodeUnknownSync(Schema3.fromJsonString(CassetteSchema));
var failIfUnsafe = (name, findings) => findings.length === 0 ? Effect.void : Effect.fail(new UnsafeCassetteError({ cassetteName: name, findings }));
var fileSystem = (options = {}) => Layer.effect(Service, Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const directory = options.directory ?? DEFAULT_RECORDINGS_DIR;
  const recorded = new Map;
  const appendLock = yield* Semaphore.make(1);
  const pathFor2 = (name) => cassettePath(directory, name);
  const walk = (current) => Effect.gen(function* () {
    const entries = yield* fs.readDirectory(current).pipe(Effect.catch(() => Effect.succeed([])));
    const nested = yield* Effect.forEach(entries, (entry) => {
      const full = path.join(current, entry);
      return fs.stat(full).pipe(Effect.flatMap((stat) => stat.type === "Directory" ? walk(full) : Effect.succeed([full])), Effect.catch(() => Effect.succeed([])));
    });
    return nested.flat();
  });
  return Service.of({
    read: (name) => fs.readFileString(pathFor2(name)).pipe(Effect.map((raw) => parseCassette(raw).interactions), Effect.catch(() => Effect.fail(new CassetteNotFoundError({ cassetteName: name })))),
    append: (name, interaction, metadata) => appendLock.withPermit(Effect.gen(function* () {
      const entry = recorded.get(name) ?? { interactions: [], findings: [] };
      const interactions = [...entry.interactions, interaction];
      const interactionFindings = [...entry.findings, ...secretFindings(interaction)];
      const cassette = buildCassette(name, interactions, metadata);
      const findings = [...interactionFindings, ...secretFindings(cassette.metadata ?? {})];
      yield* failIfUnsafe(name, findings);
      const target = pathFor2(name);
      yield* fs.makeDirectory(path.dirname(target), { recursive: true }).pipe(Effect.orDie);
      const temporary = `${target}.${crypto.randomUUID()}.tmp`;
      yield* fs.writeFileString(temporary, formatCassette(cassette)).pipe(Effect.flatMap(() => fs.rename(temporary, target)), Effect.ensuring(fs.remove(temporary, { force: true }).pipe(Effect.catch(() => Effect.void))), Effect.orDie);
      recorded.set(name, { interactions, findings: interactionFindings });
    })),
    exists: (name) => fs.access(pathFor2(name)).pipe(Effect.as(true), Effect.catch(() => Effect.succeed(false))),
    list: () => walk(directory).pipe(Effect.map((files) => files.filter((file) => file.endsWith(".json")).map((file) => path.relative(directory, file).replace(/\\/g, "/").replace(/\.json$/, "")).toSorted((a, b) => a.localeCompare(b))))
  });
}));

// src/internal-effect.ts
import { NodeFileSystem } from "@effect/platform-node";
import { Deferred, Effect as Effect3, Layer as Layer2, Option as Option3, Ref } from "effect";
import {
  FetchHttpClient,
  Headers,
  HttpBody,
  HttpClient,
  HttpClientError,
  HttpClientRequest,
  HttpClientResponse,
  UrlParams
} from "effect/unstable/http";

// src/matching.ts
import { Option, Schema as Schema4 } from "effect";
var JsonValue = Schema4.fromJsonString(Schema4.Unknown);
var decodeJson = Schema4.decodeUnknownOption(JsonValue);
var isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var canonicalizeJson = (value) => {
  if (Array.isArray(value))
    return value.map(canonicalizeJson);
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).toSorted().map((key) => [key, canonicalizeJson(value[key])]));
  }
  return value;
};
var canonicalSnapshot = (snapshot) => JSON.stringify({
  method: snapshot.method,
  url: snapshot.url,
  headers: canonicalizeJson(snapshot.headers),
  body: Option.match(decodeJson(snapshot.body), {
    onNone: () => snapshot.body,
    onSome: canonicalizeJson
  })
});
var defaultMatcher = (incoming, recorded) => canonicalSnapshot(incoming) === canonicalSnapshot(recorded);
var safeText = (value) => {
  if (value === undefined)
    return "undefined";
  if (secretFindings(value).length > 0)
    return JSON.stringify(REDACTED);
  const text = JSON.stringify(value);
  if (!text)
    return typeof value;
  return text.length > 300 ? `${text.slice(0, 300)}...` : text;
};
var jsonBody = (body) => Option.getOrUndefined(decodeJson(body));
var valueDiffs = (expected, received, base = "$", limit = 8) => {
  if (Object.is(expected, received))
    return [];
  if (isRecord(expected) && isRecord(received)) {
    return [...new Set([...Object.keys(expected), ...Object.keys(received)])].toSorted().flatMap((key) => valueDiffs(expected[key], received[key], `${base}.${key}`, limit)).slice(0, limit);
  }
  if (Array.isArray(expected) && Array.isArray(received)) {
    return Array.from({ length: Math.max(expected.length, received.length) }, (_, index) => index).flatMap((index) => valueDiffs(expected[index], received[index], `${base}[${index}]`, limit)).slice(0, limit);
  }
  return [`${base} expected ${safeText(expected)}, received ${safeText(received)}`];
};
var headerDiffs = (expected, received) => [...new Set([...Object.keys(expected), ...Object.keys(received)])].toSorted().flatMap((key) => {
  if (expected[key] === received[key])
    return [];
  if (expected[key] === undefined)
    return [`  ${key} unexpected ${safeText(received[key])}`];
  if (received[key] === undefined)
    return [`  ${key} missing expected ${safeText(expected[key])}`];
  return [`  ${key} expected ${safeText(expected[key])}, received ${safeText(received[key])}`];
});
var requestDiff = (expected, received) => {
  const lines = [];
  if (expected.method !== received.method) {
    lines.push("method:", `  expected ${expected.method}, received ${received.method}`);
  }
  if (expected.url !== received.url) {
    lines.push("url:", `  expected ${expected.url}`, `  received ${received.url}`);
  }
  const headers = headerDiffs(expected.headers, received.headers);
  if (headers.length > 0)
    lines.push("headers:", ...headers.slice(0, 8));
  const expectedBody = jsonBody(expected.body);
  const receivedBody = jsonBody(received.body);
  const body = expectedBody !== undefined && receivedBody !== undefined ? valueDiffs(expectedBody, receivedBody).map((line) => `  ${line}`) : expected.body === received.body ? [] : [`  expected ${safeText(expected.body)}, received ${safeText(received.body)}`];
  if (body.length > 0)
    lines.push("body:", ...body);
  return lines;
};
var selectSequential = (interactions, incoming, match, index) => {
  const interaction = interactions[index];
  if (!interaction)
    return { interaction, detail: `interaction ${index + 1} of ${interactions.length} not recorded` };
  if (!match(incoming, interaction.request))
    return { interaction: undefined, detail: requestDiff(interaction.request, incoming).join(`
`) };
  return { interaction, detail: "" };
};

// src/recorder.ts
import { Effect as Effect2, SynchronizedRef } from "effect";
var isCI = () => {
  const value = process.env.CI;
  return value !== undefined && value !== "" && value !== "false" && value !== "0";
};
var resolveAutoMode = (cassette, name) => Effect2.gen(function* () {
  if (isCI())
    return "replay";
  return (yield* cassette.exists(name)) ? "replay" : "record";
});
var makeReplayState = (cassette, name, project) => Effect2.gen(function* () {
  const load = yield* Effect2.cached(cassette.read(name).pipe(Effect2.map(project)));
  const position = yield* SynchronizedRef.make(0);
  yield* Effect2.addFinalizer(() => Effect2.gen(function* () {
    const used = yield* SynchronizedRef.get(position);
    if (used === 0)
      return yield* Effect2.void;
    const interactions = yield* load.pipe(Effect2.orDie);
    if (used < interactions.length)
      return yield* Effect2.die(new Error(`Unused recorded interactions in ${name}: used ${used} of ${interactions.length}`));
    return yield* Effect2.void;
  }));
  return {
    claim: (validate) => Effect2.flatMap(load, (interactions) => SynchronizedRef.modifyEffect(position, (index) => Effect2.gen(function* () {
      const interaction = interactions[index];
      yield* validate(interaction, index, interactions);
      if (interaction === undefined)
        return yield* Effect2.die("Replay validation accepted a missing interaction");
      return [{ interaction, index }, index + 1];
    })))
  };
});

// src/redactor.ts
import { Option as Option2 } from "effect";
var DEFAULT_REQUEST_HEADERS = ["content-type", "accept", "openai-beta"];
var DEFAULT_RESPONSE_HEADERS = ["content-type"];
var identity = (value) => value;
var compose = (...redactors) => {
  const requests = redactors.map((r) => r.request).filter((fn) => fn !== undefined);
  const responses = redactors.map((r) => r.response).filter((fn) => fn !== undefined);
  return {
    request: requests.length === 0 ? identity : (snapshot) => requests.reduce((acc, fn) => fn(acc), snapshot),
    response: responses.length === 0 ? identity : (snapshot) => responses.reduce((acc, fn) => fn(acc), snapshot)
  };
};
var requestHeaders = (options = {}) => ({
  request: (snapshot) => ({
    ...snapshot,
    headers: redactHeaders(snapshot.headers, options.allow ?? DEFAULT_REQUEST_HEADERS, options.redact)
  })
});
var responseHeaders = (options = {}) => ({
  response: (snapshot) => ({
    ...snapshot,
    headers: redactHeaders(snapshot.headers, options.allow ?? DEFAULT_RESPONSE_HEADERS, options.redact)
  })
});
var url = (options = {}) => ({
  request: (snapshot) => ({ ...snapshot, url: redactUrl(snapshot.url, options.query, options.transform) })
});
var DEFAULT_REDACT_JSON_FIELDS = [
  "access_token",
  "api_key",
  "apikey",
  "client_secret",
  "password",
  "refresh_token",
  "secret",
  "token"
];
var normalizeField = (field) => field.replace(/[^a-z0-9]/gi, "").toLowerCase();
var redactJsonFields = (value, fields) => {
  if (Array.isArray(value))
    return value.map((item) => redactJsonFields(item, fields));
  if (!value || typeof value !== "object")
    return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    fields.has(normalizeField(key)) ? REDACTED : redactJsonFields(child, fields)
  ]));
};
var redactBody = (value, fields, transform) => {
  const redacted = Option2.match(decodeJson(value), {
    onNone: () => value,
    onSome: (parsed) => JSON.stringify(redactJsonFields(parsed, fields))
  });
  return transform?.(redacted) ?? redacted;
};
var make = (options = {}) => {
  const fields = new Set([...DEFAULT_REDACT_JSON_FIELDS, ...options.jsonFields ?? []].map(normalizeField));
  return compose(requestHeaders({
    allow: [...DEFAULT_REQUEST_HEADERS, ...options.allowRequestHeaders ?? [], ...options.headers ?? []],
    redact: options.headers
  }), responseHeaders({
    allow: [...DEFAULT_RESPONSE_HEADERS, ...options.allowResponseHeaders ?? [], ...options.headers ?? []],
    redact: options.headers
  }), url({ query: options.queryParameters, transform: options.url }), {
    request: (snapshot) => ({
      ...snapshot,
      body: redactBody(snapshot.body, fields, options.body)
    }),
    response: (snapshot) => ({
      ...snapshot,
      body: redactBody(snapshot.body, fields, options.body)
    })
  });
};

// src/internal-effect.ts
var TEXT_CONTENT_TYPES = new Set([
  "application/graphql",
  "application/javascript",
  "application/json",
  "application/sql",
  "application/x-www-form-urlencoded",
  "application/xml",
  "application/yaml",
  "image/svg+xml"
]);
var isTextContentType = (contentType) => {
  const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  if (!mediaType)
    return false;
  return mediaType.startsWith("text/") || mediaType.endsWith("+json") || mediaType.endsWith("+xml") || TEXT_CONTENT_TYPES.has(mediaType);
};
var captureResponseBody = (response, contentType) => response.arrayBuffer.pipe(Effect3.map((bytes) => isTextContentType(contentType) ? { body: new TextDecoder().decode(bytes) } : { body: Buffer.from(bytes).toString("base64"), bodyEncoding: "base64" }));
var decodeResponseBody = (snapshot) => snapshot.bodyEncoding === "base64" ? Buffer.from(snapshot.body, "base64") : snapshot.body;
var responseFromSnapshot = (request, snapshot) => HttpClientResponse.fromWeb(request, new Response(request.method === "HEAD" || snapshot.status === 204 || snapshot.status === 205 || snapshot.status === 304 ? null : decodeResponseBody(snapshot), snapshot));
var redactedErrorRequest = (request) => HttpClientRequest.makeWith(request.method, redactUrl(request.url), UrlParams.empty, Option3.none(), Headers.empty, HttpBody.empty);
var transportError = (request, description) => new HttpClientError.HttpClientError({
  reason: new HttpClientError.TransportError({ request: redactedErrorRequest(request), description })
});
var recordingLayer = (name, options = {}) => Layer2.effect(HttpClient.HttpClient, Effect3.gen(function* () {
  const upstream = yield* HttpClient.HttpClient;
  const cassetteService = yield* Service;
  const redactor = options.redactor ?? make();
  const match = options.match ?? defaultMatcher;
  const requested = options.mode ?? "auto";
  const mode = requested === "auto" ? yield* resolveAutoMode(cassetteService, name) : requested;
  const snapshotRequest = (request) => Effect3.gen(function* () {
    const web = yield* HttpClientRequest.toWeb(request).pipe(Effect3.orDie);
    return redactor.request({
      method: web.method,
      url: web.url,
      headers: Object.fromEntries(web.headers.entries()),
      body: yield* Effect3.promise(() => web.text())
    });
  });
  if (mode === "passthrough")
    return upstream;
  if (mode === "record") {
    const initial = yield* Deferred.make();
    yield* Deferred.succeed(initial, undefined);
    const tail = yield* Ref.make(initial);
    return HttpClient.make((request) => Effect3.gen(function* () {
      const completed = yield* Deferred.make();
      const previous = yield* Ref.modify(tail, (current) => [current, completed]);
      return yield* Effect3.gen(function* () {
        const incoming = yield* snapshotRequest(request);
        const response = yield* upstream.execute(request);
        const captured = yield* captureResponseBody(response, response.headers["content-type"]);
        const responseSnapshot = {
          status: response.status,
          headers: response.headers,
          ...captured
        };
        const interaction = {
          transport: "http",
          request: incoming,
          response: redactor.response(responseSnapshot)
        };
        yield* Deferred.await(previous);
        yield* cassetteService.append(name, interaction, options.metadata).pipe(Effect3.catchTag("UnsafeCassetteError", (error) => Effect3.fail(transportError(request, error.message))));
        return responseFromSnapshot(request, responseSnapshot);
      }).pipe(Effect3.ensuring(Deferred.succeed(completed, undefined)));
    }));
  }
  const replay = yield* makeReplayState(cassetteService, name, httpInteractions);
  return HttpClient.make((request) => Effect3.gen(function* () {
    const incoming = yield* snapshotRequest(request);
    const claimed = yield* replay.claim((interaction, index, interactions) => {
      const result = selectSequential(interactions, incoming, match, index);
      if (result.interaction)
        return Effect3.void;
      return Effect3.fail(transportError(request, `Fixture "${name}" does not match the current request: ${result.detail}.`));
    }).pipe(Effect3.mapError((error) => error._tag === "CassetteNotFoundError" ? transportError(request, `Fixture "${name}" not found. Run locally to record it (CI=true forces replay).`) : error));
    return responseFromSnapshot(request, claimed.interaction.response);
  }));
}));

// src/effect.ts
var http = (name, options = {}) => recordingLayer(name, {
  metadata: options.metadata,
  redactor: make(options.redact),
  match: options.match
}).pipe(Layer3.provide(fileSystem({ directory: options.directory })), Layer3.provide(FetchHttpClient2.layer), Layer3.provide(NodeFileSystem2.layer));

// src/socket.ts
import { NodeFileSystem as NodeFileSystem3 } from "@effect/platform-node";
import { Deferred as Deferred2, Effect as Effect4, Exit, FiberSet, Layer as Layer4, Ref as Ref2, Semaphore as Semaphore2 } from "effect";
import { Socket } from "effect/unstable/socket";
var encodeEvent = (direction, message) => typeof message === "string" ? { direction, kind: "text", body: message } : { direction, kind: "binary", body: Buffer.from(message).toString("base64"), bodyEncoding: "base64" };
var decodeEvent = (event) => event.kind === "text" ? event.body : new Uint8Array(Buffer.from(event.body, "base64"));
var redactEvent = (event, redactor) => {
  if (event.kind === "binary")
    return event;
  const body = event.direction === "client" ? redactor.request({ method: "WEBSOCKET", url: "", headers: {}, body: event.body }).body : redactor.response({ status: 101, headers: {}, body: event.body }).body;
  return { ...event, body };
};
var comparable = (event, asJson) => {
  if (!asJson || event.kind === "binary")
    return JSON.stringify(canonicalizeJson(event));
  const decoded = decodeJson(event.body);
  return JSON.stringify(canonicalizeJson({
    ...event,
    body: decoded._tag === "None" ? event.body : canonicalizeJson(decoded.value)
  }));
};
var assertEvent = (actual, expected, index, asJson) => Effect4.sync(() => {
  if (expected && comparable(actual, asJson) === comparable(expected, asJson))
    return;
  throw new Error(`WebSocket event ${index + 1}: expected ${safeText(expected)}, received ${safeText(actual)}`);
});
var runHandler = (handler, value) => Effect4.suspend(() => {
  const result = handler(value);
  return Effect4.isEffect(result) ? Effect4.asVoid(result) : Effect4.void;
});
var runReplay = (state, handler, decode, onOpen) => Effect4.scoped(Effect4.gen(function* () {
  const handlers = yield* FiberSet.make();
  const run = yield* FiberSet.runtime(handlers)();
  if (onOpen)
    yield* onOpen;
  const drive = Effect4.gen(function* () {
    while (true) {
      const current = yield* Ref2.get(state.progress);
      const event = state.interaction.events[current.position];
      if (!event)
        return;
      if (yield* Ref2.get(state.closed))
        return yield* Effect4.die(new Error(`WebSocket closed with unconsumed events: used ${current.position} of ${state.interaction.events.length}`));
      if (event.direction === "server") {
        yield* Ref2.set(state.progress, {
          position: current.position + 1,
          changed: yield* Deferred2.make()
        });
        run(runHandler(handler, decode(event)));
        continue;
      }
      yield* Deferred2.await(current.changed);
    }
  });
  yield* drive.pipe(Effect4.raceFirst(FiberSet.join(handlers)));
  yield* FiberSet.awaitEmpty(handlers).pipe(Effect4.raceFirst(FiberSet.join(handlers)));
}));
var openSnapshot = (request, redactor) => {
  const snapshot = redactor.request({ method: "GET", url: request.url, headers: request.headers ?? {}, body: "" });
  return { url: snapshot.url, headers: snapshot.headers };
};
var makeRecordingSocket = (upstream, cassette, name, request, options, redactor) => Effect4.gen(function* () {
  const active = yield* Ref2.make(undefined);
  const writeLock = yield* Semaphore2.make(1);
  return Socket.make({
    runRaw: (handler, runOptions) => Effect4.gen(function* () {
      const state = {
        events: [],
        eventLock: yield* Semaphore2.make(1),
        accepting: yield* Ref2.make(true),
        opened: false,
        valid: true
      };
      const occupied = yield* Ref2.modify(active, (current) => [current !== undefined, current ?? state]);
      if (occupied)
        return yield* Effect4.die("Concurrent runs of a recorded WebSocket are not supported");
      yield* upstream.runRaw((message) => {
        if (!Ref2.getUnsafe(state.accepting))
          throw new Error("WebSocket received a frame after closing");
        state.events.push(redactEvent(encodeEvent("server", message), redactor));
        return handler(message);
      }, {
        ...runOptions,
        onOpen: Effect4.gen(function* () {
          state.opened = true;
          if (runOptions?.onOpen)
            yield* runOptions.onOpen;
        })
      }).pipe(Effect4.onExit((exit) => writeLock.withPermit(state.eventLock.withPermit(Effect4.gen(function* () {
        yield* Ref2.set(state.accepting, false);
        yield* Ref2.set(active, undefined);
        if (!Exit.isSuccess(exit) || !state.opened || !state.valid)
          return;
        yield* cassette.append(name, {
          transport: "websocket",
          open: openSnapshot(request, redactor),
          events: [...state.events]
        }, options.metadata).pipe(Effect4.orDie);
      })))));
    }),
    writer: upstream.writer.pipe(Effect4.map((write) => (message) => writeLock.withPermit(Effect4.gen(function* () {
      if (Socket.isCloseEvent(message))
        return yield* write(message);
      const state = yield* Ref2.get(active);
      if (!state || !(yield* Ref2.get(state.accepting)))
        return yield* Effect4.die("WebSocket writer used without an active socket run");
      const event = redactEvent(encodeEvent("client", message), redactor);
      yield* state.eventLock.withPermit(Effect4.sync(() => state.events.push(event)));
      return yield* write(message).pipe(Effect4.onError(() => Effect4.sync(() => state.valid = false)));
    }))))
  });
});
var makeReplaySocket = (cassette, name, request, options, redactor) => Effect4.gen(function* () {
  const replay = yield* makeReplayState(cassette, name, webSocketInteractions);
  const active = yield* Ref2.make(undefined);
  return Socket.make({
    runRaw: (handler, runOptions) => Effect4.gen(function* () {
      const claimed = yield* replay.claim((interaction, index) => Effect4.sync(() => {
        const incoming = openSnapshot(request, redactor);
        if (interaction && JSON.stringify(canonicalizeJson(incoming)) === JSON.stringify(canonicalizeJson(interaction.open)))
          return;
        throw new Error(`WebSocket open ${index + 1}: expected ${safeText(interaction?.open)}, received ${safeText(incoming)}`);
      })).pipe(Effect4.orDie);
      const progress = yield* Ref2.make({ position: 0, changed: yield* Deferred2.make() });
      const writeLock = yield* Semaphore2.make(1);
      const state = {
        interaction: claimed.interaction,
        progress,
        writeLock,
        closed: yield* Ref2.make(false)
      };
      const occupied = yield* Ref2.modify(active, (current) => [current !== undefined, current ?? state]);
      if (occupied)
        return yield* Effect4.die("Concurrent runs of a replayed WebSocket are not supported");
      yield* runReplay(state, handler, decodeEvent, runOptions?.onOpen).pipe(Effect4.ensuring(Ref2.set(active, undefined)));
    }),
    writer: Effect4.succeed((message) => {
      return Ref2.get(active).pipe(Effect4.flatMap((state) => state ? state.writeLock.withPermit(Effect4.gen(function* () {
        const current = yield* Ref2.get(state.progress);
        if (Socket.isCloseEvent(message)) {
          yield* Ref2.set(state.closed, true);
          yield* Deferred2.succeed(current.changed, undefined);
          if (current.position === state.interaction.events.length)
            return;
          return yield* Effect4.die(new Error(`WebSocket closed with unconsumed events: used ${current.position} of ${state.interaction.events.length}`));
        }
        const actual = redactEvent(encodeEvent("client", message), redactor);
        yield* assertEvent(actual, state.interaction.events[current.position], current.position, options.compareClientMessagesAsJson === true);
        yield* Ref2.set(state.progress, {
          position: current.position + 1,
          changed: yield* Deferred2.make()
        });
        yield* Deferred2.succeed(current.changed, undefined);
      })) : Effect4.die("WebSocket writer used without an active socket run")));
    })
  });
});
var recordingLayer2 = (name, request, options, forcedMode) => Layer4.effect(Socket.Socket, Effect4.gen(function* () {
  const upstream = yield* Socket.Socket;
  const cassette = yield* Service;
  const redactor = make(options.redact);
  if ((forcedMode ?? (yield* resolveAutoMode(cassette, name))) === "record")
    return yield* makeRecordingSocket(upstream, cassette, name, request, options, redactor);
  return yield* makeReplaySocket(cassette, name, request, options, redactor);
}));
var socket = (name, options = {}) => provideCassette(recordingLayer2(name, { url: "" }, { ...options, compareClientMessagesAsJson: true }), options);
var provideCassette = (layer, options) => layer.pipe(Layer4.provide(fileSystem({ directory: options.directory })), Layer4.provide(NodeFileSystem3.layer));

// src/index.ts
var HttpRecorder = { http, socket };
export {
  HttpRecorder
};
