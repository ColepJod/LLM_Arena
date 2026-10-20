"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";

import { ApiError, streamCompare } from "@/lib/api";
import type {
  ComparisonState,
  ModelSelection,
  ResearchState,
  Side,
  SideMetrics,
  SideState,
} from "@/types";

const SIDES: Side[] = ["a", "b"];

function idleSide(): SideState {
  return {
    status: "idle",
    text: "",
    metrics: null,
    error: null,
    stopped: false,
  };
}

function initialState(): ComparisonState {
  return {
    a: idleSide(),
    b: idleSide(),
    lastPrompt: null,
    research: null,
  };
}

type Action =
  | { type: "begin"; prompt: string }
  | { type: "start"; side: Side }
  | { type: "append"; side: Side; text: string }
  | { type: "done"; side: Side; metrics: SideMetrics }
  | { type: "error"; side: Side; message: string }
  | { type: "research"; research: ResearchState }
  | { type: "stop" }
  | { type: "clear" };

function updateSide(
  state: ComparisonState,
  side: Side,
  update: (current: SideState) => SideState,
): ComparisonState {
  return { ...state, [side]: update(state[side]) };
}

function reducer(state: ComparisonState, action: Action): ComparisonState {
  switch (action.type) {
    case "begin":
      return {
        a: {
          ...idleSide(),
          status: "streaming",
        },
        b: {
          ...idleSide(),
          status: "streaming",
        },
        lastPrompt: action.prompt,
        research: null,
      };
    case "start":
      return updateSide(state, action.side, (side) =>
        side.status === "idle" ? { ...side, status: "streaming" } : side,
      );
    case "append":
      return updateSide(state, action.side, (side) =>
        side.status === "streaming"
          ? { ...side, text: side.text + action.text }
          : side,
      );
    case "done":
      return updateSide(state, action.side, (side) =>
        side.status === "streaming"
          ? {
              ...side,
              status: "done",
              metrics: action.metrics,
              error: null,
              stopped: false,
            }
          : side,
      );
    case "error":
      return updateSide(state, action.side, (side) =>
        side.status === "streaming"
          ? { ...side, status: "error", error: action.message, metrics: null }
          : side,
      );
    case "research":
      return { ...state, research: action.research };
    case "stop":
      return {
        ...state,
        a:
          state.a.status === "streaming"
            ? { ...state.a, status: "done", metrics: null, stopped: true }
            : state.a,
        b:
          state.b.status === "streaming"
            ? { ...state.b, status: "done", metrics: null, stopped: true }
            : state.b,
      };
    case "clear":
      return initialState();
    default:
      return state;
  }
}

function messageForError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Could not reach the backend. Make sure it is running.";
}

export function useCompare() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);
  const buffersRef = useRef<Record<Side, string>>({ a: "", b: "" });
  const rafRef = useRef<number | null>(null);

  const flushBuffers = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    for (const side of SIDES) {
      const text = buffersRef.current[side];
      if (text) {
        buffersRef.current[side] = "";
        dispatch({ type: "append", side, text });
      }
    }
  }, []);

  const scheduleFlush = useCallback(() => {
    if (rafRef.current !== null) {
      return;
    }
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      flushBuffers();
    });
  }, [flushBuffers]);

  const failStreamingSides = useCallback((message: string) => {
    for (const side of SIDES) {
      dispatch({ type: "error", side, message });
    }
  }, []);

  const run = useCallback(
    (prompt: string, a: ModelSelection, b: ModelSelection) => {
      const trimmed = prompt.trim();
      if (!trimmed || abortRef.current) {
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      const runId = ++runIdRef.current;
      buffersRef.current = { a: "", b: "" };
      dispatch({ type: "begin", prompt: trimmed });

      void (async () => {
        try {
          for await (const event of streamCompare(
            { prompt: trimmed, a, b },
            controller.signal,
          )) {
            if (runId !== runIdRef.current) {
              return;
            }
            switch (event.type) {
              case "start":
                dispatch({ type: "start", side: event.side });
                break;
              case "delta":
                buffersRef.current[event.side] += event.text;
                scheduleFlush();
                break;
              case "done":
                flushBuffers();
                dispatch({
                  type: "done",
                  side: event.side,
                  metrics: {
                    ttftMs: event.ttft_ms,
                    totalMs: event.total_ms,
                    outputChars: event.output_chars,
                  },
                });
                break;
              case "error":
                flushBuffers();
                dispatch({
                  type: "error",
                  side: event.side,
                  message: event.message,
                });
                break;
              case "research":
                dispatch({
                  type: "research",
                  research: {
                    status: event.status,
                    query: event.query,
                    sources: event.sources,
                    message: event.message,
                  },
                });
                break;
            }
          }

          if (runId === runIdRef.current) {
            flushBuffers();
            failStreamingSides("The response stream ended unexpectedly.");
          }
        } catch (error) {
          if (runId !== runIdRef.current) {
            return;
          }
          flushBuffers();
          if (controller.signal.aborted) {
            dispatch({ type: "stop" });
          } else {
            failStreamingSides(messageForError(error));
          }
        } finally {
          if (runId === runIdRef.current) {
            abortRef.current = null;
          }
        }
      })();
    },
    [failStreamingSides, flushBuffers, scheduleFlush],
  );

  const stop = useCallback(() => {
    if (!abortRef.current) {
      return;
    }
    abortRef.current.abort();
    flushBuffers();
    dispatch({ type: "stop" });
  }, [flushBuffers]);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    runIdRef.current += 1;
    buffersRef.current = { a: "", b: "" };
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    dispatch({ type: "clear" });
  }, []);

  useEffect(() => {
    return () => {
      runIdRef.current += 1;
      abortRef.current?.abort();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return {
    a: state.a,
    b: state.b,
    lastPrompt: state.lastPrompt,
    research: state.research,
    isStreaming:
      state.a.status === "streaming" || state.b.status === "streaming",
    run,
    stop,
    clear,
  };
}
