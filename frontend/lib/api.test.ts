import { describe, expect, it } from "vitest";

import { readNdjson } from "@/lib/api";

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

async function collect<T>(stream: ReadableStream<Uint8Array>): Promise<T[]> {
  const events: T[] = [];
  for await (const event of readNdjson<T>(stream)) {
    events.push(event);
  }
  return events;
}

describe("readNdjson", () => {
  it("parses lines split across arbitrary chunks", async () => {
    const events = await collect<{ type: string; text?: string }>(
      streamFromChunks([
        '{"type":"delta","text":"Hel',
        'lo"}\n{"type":"do',
        'ne"}\n',
      ]),
    );

    expect(events).toEqual([
      { type: "delta", text: "Hello" },
      { type: "done" },
    ]);
  });

  it("parses multiple events in one chunk and ignores blank lines", async () => {
    const events = await collect<{ value: number }>(
      streamFromChunks(['\n{"value":1}\r\n\n{"value":2}\n\n', '{"value":3}']),
    );

    expect(events).toEqual([{ value: 1 }, { value: 2 }, { value: 3 }]);
  });

  it("skips malformed lines and reports them", async () => {
    const malformed: string[] = [];
    const stream = streamFromChunks(['{"ok":true}\nnot-json\n{"ok":false}\n']);
    const events: { ok: boolean }[] = [];

    for await (const event of readNdjson<{ ok: boolean }>(stream, {
      onMalformedLine: (line) => malformed.push(line),
    })) {
      events.push(event);
    }

    expect(events).toEqual([{ ok: true }, { ok: false }]);
    expect(malformed).toEqual(["not-json"]);
  });

  it("flushes a final line without a trailing newline", async () => {
    const events = await collect<{ final: boolean }>(
      streamFromChunks(['{"final":true}']),
    );
    expect(events).toEqual([{ final: true }]);
  });
});
