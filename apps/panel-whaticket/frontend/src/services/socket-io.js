import openSocket from "socket.io-client";
import { getBackendUrl } from "../config";

function connectToSocket() {
    const raw = localStorage.getItem("token");
    if (!raw) {
      // Don't attempt to connect without a token (prevents token=null loops)
      return openSocket(getBackendUrl(), { autoConnect: false });
    }

    let token;
    try {
      token = JSON.parse(raw);
    } catch {
      token = raw;
    }

    return openSocket(getBackendUrl(), {
      transports: ["websocket", "polling", "flashsocket"],
      query: {
        token,
      },
    });
}

export default connectToSocket;