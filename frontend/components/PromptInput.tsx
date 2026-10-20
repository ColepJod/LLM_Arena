"use client";

import { Play, Square } from "lucide-react";
import type { KeyboardEvent } from "react";

const MAX_PROMPT_CHARS = 4_000;

interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  disabled: boolean;
  isStreaming: boolean;
}

export function PromptInput({
  value,
  onChange,
  onSubmit,
  onStop,
  disabled,
  isStreaming,
}: PromptInputProps) {
  const trimmed = value.trim();
  const canSubmit = trimmed.length > 0 && !disabled && !isStreaming;

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSubmit) {
        onSubmit();
      }
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) {
          onSubmit();
        }
      }}
      className="mt-4"
    >
      <label
        htmlFor="arena-prompt"
        className="mb-2 block text-sm font-medium text-zinc-800 dark:text-zinc-200"
      >
        Prompt
      </label>
      <div className="border-line bg-panel focus-within:border-accent/60 focus-within:ring-accent/10 rounded-2xl border p-2 shadow-sm transition-colors focus-within:ring-4">
        <textarea
          id="arena-prompt"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          maxLength={MAX_PROMPT_CHARS}
          placeholder="Ask both models anything..."
          disabled={disabled || isStreaming}
          aria-describedby="prompt-hint prompt-count"
          className="max-h-56 min-h-20 w-full resize-y bg-transparent px-3 py-2 text-sm leading-6 text-zinc-900 outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-50 dark:placeholder:text-zinc-600"
        />
        <div className="border-line flex flex-wrap items-center justify-between gap-3 border-t px-2 pt-2">
          <p
            id="prompt-hint"
            className="text-xs text-zinc-400 dark:text-zinc-500"
          >
            Enter to compare &middot; Shift+Enter for a new line
          </p>
          <div className="flex items-center gap-2">
            <span
              id="prompt-count"
              className={`text-xs tabular-nums ${
                value.length > MAX_PROMPT_CHARS * 0.9
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-zinc-400 dark:text-zinc-500"
              }`}
            >
              {value.length.toLocaleString()} /{" "}
              {MAX_PROMPT_CHARS.toLocaleString()}
            </span>
            {isStreaming ? (
              <button
                type="button"
                onClick={onStop}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70"
              >
                <Square
                  className="h-3.5 w-3.5 fill-current"
                  aria-hidden="true"
                />
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white dark:focus-visible:outline-zinc-100"
              >
                <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                Compare
              </button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
