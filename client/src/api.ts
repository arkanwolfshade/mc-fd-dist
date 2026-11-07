export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: { error?: string; card?: unknown; message?: string },
  ) {
    super(body.error ?? body.message ?? `Request failed (${status})`);
  }
}

export async function api<T>(method: string, url: string, body?: object): Promise<T> {
  const response = await fetch(url, {
    method,
    ...(body
      ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
  if (response.status === 204) {
    return undefined as T;
  }
  const data = await response.json();
  if (!response.ok) {
    throw new ApiError(response.status, data);
  }
  return data as T;
}

const RECONNECT_DELAY_MS = 2000;

// Reconnects until stopped. The caller reloads the shift on each connect, because
// updates sent while disconnected are not replayed.
export function connectLive(handlers: {
  onOpen: () => void;
  onClose: () => void;
  onMessage: (message: unknown) => void;
}): () => void {
  let stopped = false;
  let socket: WebSocket;

  function connect() {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(`${protocol}//${location.host}/api/live`);
    socket.onopen = handlers.onOpen;
    socket.onmessage = (event) => handlers.onMessage(JSON.parse(event.data));
    socket.onclose = () => {
      if (!stopped) {
        handlers.onClose();
        setTimeout(connect, RECONNECT_DELAY_MS);
      }
    };
  }

  connect();
  return () => {
    stopped = true;
    socket.close();
  };
}
