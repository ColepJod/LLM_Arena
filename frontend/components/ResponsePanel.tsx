"use client";

import {
  AlertCircle,
  Check,
  Copy,
  Gauge,
  Hash,
  LoaderCircle,
  Timer,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Markdown } from "@/components/Markdown";
import type {
  PaneSelection,
  Provider,
  Side,
  SideMetrics,
  SideState,
} from "@/types";

interface ResponsePanelProps {
  side: Side;
  selection: PaneSelection | null;
  state: SideState;
}

const PROVIDER_STYLES: Record<Provider, string> = {
  groq: "bg-orange-500/10 text-orange-700 ring-orange-500/20 dark:text-orange-300",
  openrouter:
    "bg-violet-500/10 text-violet-700 ring-violet-500/20 dark:text-violet-300",
  gemini: "bg-sky-500/10 text-sky-700 ring-sky-500/20 dark:text-sky-300",
};

function formatDuration(ms: number): string {
  if (ms < 1_000) {
    return `${ms} ms`;
  }
  return `${(ms / 1_000).toFixed(2)} s`;
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function statusLabel(state: SideState): string {
  if (state.stopped) {
    return "Stopped";
  }
  switch (state.status) {
    case "streaming":
      return "Streaming";
    case "done":
      return "Complete";
    case "error":
      return "Error";
    default:
      return "Ready";
  }
}

function Metrics({ metrics, text }: { metrics: SideMetrics; text: string }) {
  const approximateTokens = Math.max(1, Math.ceil(metrics.outputChars / 4));
  const words = wordCount(text);

  return (
    <div className="border-line flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
      <span className="inline-flex items-center gap-1.5">
        <Timer className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">Time to first token: </span>
        {formatDuration(metrics.ttftMs)} TTFT
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">Total time: </span>
        {formatDuration(metrics.totalMs)} total
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Hash className="h-3.5 w-3.5" aria-hidden="true" />~
        {approximateTokens.toLocaleString()} tokens
        <span className="text-zinc-300 dark:text-zinc-600">&middot;</span>
        {words.toLocaleString()} words
      </span>
    </div>
  );
}

export function ResponsePanel({ side, selection, state }: ResponsePanelProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isStreaming = state.status === "streaming";
  const hasText = state.text.trim().length > 0;

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    if (!hasText) {
      return;
    }
    try {
      await navigator.clipboard.writeText(state.text);
      setCopied(true);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => setCopied(false), 1_800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <article className="border-line bg-panel flex min-h-[22rem] flex-col overflow-hidden rounded-2xl border shadow-sm">
      <header className="border-line flex items-start justify-between gap-3 border-b px-4 py-3.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-[10px] font-bold text-white ${
                side === "a" ? "bg-indigo-600" : "bg-sky-600"
              }`}
              aria-hidden="true"
            >
              {side.toUpperCase()}
            </span>
            <h2
              className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50"
              title={selection?.modelName ?? selection?.model}
            >
              {selection?.modelName || "No model selected"}
            </h2>
            {selection && (
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase ring-1 ring-inset ${PROVIDER_STYLES[selection.provider]}`}
              >
                {selection.provider === "openrouter"
                  ? "OpenRouter"
                  : selection.provider === "groq"
                    ? "Groq"
                    : "Gemini"}
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-xs text-zinc-400 dark:text-zinc-500">
            {selection?.model ?? "Waiting for a model"}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium ${
              state.status === "error"
                ? "bg-red-500/10 text-red-700 dark:text-red-300"
                : state.status === "streaming"
                  ? "bg-accent/10 text-accent"
                  : "bg-zinc-500/10 text-zinc-500 dark:text-zinc-400"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                state.status === "error"
                  ? "bg-red-500"
                  : state.status === "streaming"
                    ? "bg-accent animate-pulse"
                    : state.status === "done"
                      ? "bg-emerald-500"
                      : "bg-zinc-400"
              }`}
              aria-hidden="true"
            />
            {statusLabel(state)}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!hasText}
            aria-label={`Copy response from ${selection?.modelName ?? `pane ${side}`}`}
            className="border-line hover:bg-panel-muted focus-visible:outline-accent inline-flex h-8 w-8 items-center justify-center rounded-lg border text-zinc-500 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-35 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
        </div>
      </header>

      <div
        className="min-h-0 flex-1 px-4 py-4"
        role="region"
        aria-live="polite"
        aria-busy={isStreaming}
        aria-label={`Response from ${selection?.modelName ?? `pane ${side}`}`}
      >
        {state.error && (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            <AlertCircle
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            <p>{state.error}</p>
          </div>
        )}

        {!hasText && isStreaming && (
          <div className="flex items-center gap-2 py-2 text-sm text-zinc-400 dark:text-zinc-500">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            Waiting for the first token
            <span className="inline-flex gap-0.5" aria-hidden="true">
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="h-1 w-1 animate-pulse rounded-full bg-current"
                  style={{ animationDelay: `${dot * 140}ms` }}
                />
              ))}
            </span>
          </div>
        )}

        {!hasText && !isStreaming && !state.error && (
          <p className="py-2 text-sm text-zinc-400 dark:text-zinc-500">
            {state.status === "done" ? "No output was returned." : "Ready."}
          </p>
        )}

        {hasText && (
          <>
            <Markdown content={state.text} />
            {isStreaming && (
              <span
                className="arena-caret bg-accent mt-1 inline-block h-4 w-0.5 align-middle"
                aria-hidden="true"
              />
            )}
          </>
        )}
      </div>

      {state.metrics && state.status === "done" && !state.stopped && (
        <Metrics metrics={state.metrics} text={state.text} />
      )}
    </article>
  );
}
