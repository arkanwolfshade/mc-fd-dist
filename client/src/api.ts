export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: { error?: string; card?: unknown; message?: string },
  ) {
    super(body.error ?? body.message ?? `Request failed (${status})`);
  }
}

export class NetworkError extends Error {
  constructor() {
    super("This needs a connection. Please try again when it returns.");
  }
}

// What to tell a volunteer about a failure: its own message, or `fallback` for anything
// that is not an Error.
export function errorText(failure: unknown, fallback: string): string {
  return failure instanceof Error ? failure.message : fallback;
}

export async function api<T>(method: string, url: string, body?: object): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      ...(body
        ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
        : {}),
    });
  } catch {
    throw new NetworkError();
  }
  if (response.status === 204) {
    return undefined as T;
  }
  if (!response.ok) {
    // A proxy's error page is not JSON; callers still need the status to decide what to do.
    const errorBody = await response.json().catch(() => null);
    throw new ApiError(response.status, errorBody ?? {});
  }
  return (await response.json()) as T;
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
    socket.addEventListener("open", handlers.onOpen);
    socket.addEventListener("message", (event) => handlers.onMessage(JSON.parse(event.data)));
    socket.addEventListener("close", () => {
      if (!stopped) {
        handlers.onClose();
        setTimeout(connect, RECONNECT_DELAY_MS);
      }
    });
  }

  connect();
  return () => {
    stopped = true;
    socket.close();
  };
}
