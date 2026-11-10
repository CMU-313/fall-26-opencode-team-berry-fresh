import { Layer } from "effect";
import { Socket } from "effect/unstable/socket";
import type { RecorderOptions } from "./types.js";
/**
 * Wraps a provided `Socket.Socket` with cassette recording and replay.
 *
 * Supply the ordinary URL-bound Effect socket layer beneath this decorator.
 * The cassette name identifies the connection; recorder configuration does not
 * duplicate the transport URL.
 */
export declare const socket: (name: string, options?: RecorderOptions) => Layer.Layer<Socket.Socket, never, Socket.Socket>;
