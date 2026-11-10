/** HTTP and WebSocket cassette recording. */
export declare const HttpRecorder: {
    readonly http: (name: string, options?: import("./types.js").RecorderOptions) => import("effect/Layer").Layer<import("effect/unstable/http/HttpClient").HttpClient>;
    readonly socket: (name: string, options?: import("./types.js").RecorderOptions) => import("effect/Layer").Layer<import("effect/unstable/socket/Socket").Socket, never, import("effect/unstable/socket/Socket").Socket>;
};
export declare namespace HttpRecorder {
    /** Additional JSON metadata stored with a cassette. */
    type CassetteMetadata = import("./types.js").CassetteMetadata;
    /** Recorder configuration. */
    type RecorderOptions = import("./types.js").RecorderOptions;
    /** Additive redaction and header-preservation policy. */
    type RedactOptions = import("./types.js").RedactOptions;
    /** Returns whether an incoming HTTP request matches a recorded request. */
    type RequestMatcher = import("./types.js").RequestMatcher;
    /** The normalized HTTP request representation used for matching. */
    type RequestSnapshot = import("./types.js").RequestSnapshot;
}
