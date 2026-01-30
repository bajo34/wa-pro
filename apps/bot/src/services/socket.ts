import type { Server as SocketIoServer } from "socket.io";

/**
 * Simple module to hold a reference to the Socket.IO server instance.
 * This allows other parts of the application (e.g. webhook handlers) to
 * emit events without requiring a tight import coupling to the main
 * Express app. The instance is set from index.ts when the server
 * is created and can be retrieved elsewhere via getSocket().
 */
let io: SocketIoServer | null = null;

/**
 * Store the provided Socket.IO server so that it can be used globally.
 *
 * @param server The Socket.IO server instance to store.
 */
export function setSocket(server: SocketIoServer) {
  io = server;
}

/**
 * Retrieve the stored Socket.IO server instance. Returns null if
 * the server has not yet been initialised. Callers should check for
 * a non-null return value before using the instance.
 */
export function getSocket(): SocketIoServer | null {
  return io;
}