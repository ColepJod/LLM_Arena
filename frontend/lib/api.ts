import type {
  CompareEvent,
  CompareRequest,
  ModelInfo,
  ModelsResponse,
  Provider,
  ProviderInfo,
  ProvidersResponse,
} from "@/types";

export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
).replace(/\/+$/, "");

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface ErrorBody {
  detail?: unknown;
}

function errorDetail(detail: unknown): string | null {
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === "object" && item !== null && "msg" in item) {
          const message = (item as { msg?: unknown }).msg;
          return typeof message === "string" ? message : null;
        }
        return null;
      })
      .filter((message): message is string => Boolean(message));
    return messages.length ? messages.join(" ") : null;
  }
  return null;
}

async function responseError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as ErrorBody | null;
  return new ApiError(
    errorDetail(body?.detail) ??
      `Request failed with status ${response.status}.`,
    response.status,
  );
}

export async function fetchProviders(
  signal?: AbortSignal,
): Promise<ProviderInfo[]> {
  const response = await fetch(`${API_URL}/providers`, { signal });
  if (!response.ok) {
    throw await responseError(response);
  }
  const data = (await response.json()) as ProvidersResponse;
  return data.providers;
}

export async function fetchModels(
  provider: Provider,
  signal?: AbortSignal,
): Promise<ModelInfo[]> {
  const response = await fetch(
    `${API_URL}/models?provider=${encodeURIComponent(provider)}`,
    { signal },
  );
  if (!response.ok) {
    throw await responseError(response);
  }
  const data = (await response.json()) as ModelsResponse;
  return data.models;
}

interface NdjsonOptions {
  onMalformedLine?: (line: string) => void;
}

/**
 * Parse an NDJSON byte stream into typed values.
 *
 * Handles CRLF, blank lines, multiple lines per chunk, and a final line that
 * is not terminated by a newline. Malformed lines are skipped and reported
 * through the optional callback so one bad line cannot break the stream.
 */
export async function* readNdjson<T>(
  stream: ReadableStream<Uint8Array>,
  options: NdjsonOptions = {},
): AsyncGenerator<T> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const parseLine = (rawLine: string): T | null => {
    const line = rawLine.replace(/\r$/, "").trim();
    if (!line) {
      return null;
    }
    try {
      return JSON.parse(line) as T;
    } catch {
      options.onMalformedLine?.(line);
      return null;
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const event = parseLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        if (event !== null) {
          yield event;
        }
        newline = buffer.indexOf("\n");
      }
    }

    buffer += decoder.decode();
    const finalEvent = parseLine(buffer);
    if (finalEvent !== null) {
      yield finalEvent;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function* streamCompare(
  payload: CompareRequest,
  signal: AbortSignal,
): AsyncGenerator<CompareEvent> {
  const response = await fetch(`${API_URL}/compare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    throw await responseError(response);
  }
  if (!response.body) {
    throw new ApiError(
      "The server returned an empty response.",
      response.status,
    );
  }

  yield* readNdjson<CompareEvent>(response.body, {
    onMalformedLine: () => {
      console.warn("Ignoring a malformed NDJSON line from the server.");
    },
  });
}
