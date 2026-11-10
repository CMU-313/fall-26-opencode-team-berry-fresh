/** Additional JSON metadata stored with a cassette. */
export type CassetteMetadata = Record<string, unknown>;
/** The normalized HTTP request representation used for matching. */
export interface RequestSnapshot {
    /** HTTP method. */
    readonly method: string;
    /** Fully qualified URL after redaction. */
    readonly url: string;
    /** Allowed and redacted request headers. */
    readonly headers: Record<string, string>;
    /** Request body after redaction. */
    readonly body: string;
}
/** Returns whether an incoming HTTP request matches a recorded request. */
export type RequestMatcher = (incoming: RequestSnapshot, recorded: RequestSnapshot) => boolean;
/** Additive redaction and header-preservation policy. */
export interface RedactOptions {
    /** Additional sensitive headers to retain as `[REDACTED]`. */
    readonly headers?: ReadonlyArray<string>;
    /** Additional non-sensitive request headers to preserve for matching. */
    readonly allowRequestHeaders?: ReadonlyArray<string>;
    /** Additional non-sensitive response headers to preserve for replay. */
    readonly allowResponseHeaders?: ReadonlyArray<string>;
    /** Additional sensitive URL query parameter names. */
    readonly queryParameters?: ReadonlyArray<string>;
    /** Additional JSON field names to redact recursively. */
    readonly jsonFields?: ReadonlyArray<string>;
    /** Stabilizes a URL after built-in redaction. */
    readonly url?: (url: string) => string;
    /** Stabilizes a request, response, or text-frame body after built-in redaction. */
    readonly body?: (body: string) => string;
}
/** Options shared by HTTP recorder layers. */
export interface RecorderOptions {
    /** Cassette directory. Defaults to `<cwd>/test/fixtures/recordings`. */
    readonly directory?: string;
    /** Additional metadata stored in the cassette. */
    readonly metadata?: CassetteMetadata;
    /** Additive redaction and header-preservation policy. */
    readonly redact?: RedactOptions;
    /** Custom HTTP request equivalence. */
    readonly match?: RequestMatcher;
}
