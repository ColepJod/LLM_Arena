"use client";

import {
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/EmptyState";
import { ModelPicker } from "@/components/ModelPicker";
import { PromptInput } from "@/components/PromptInput";
import { ResponsePanel } from "@/components/ResponsePanel";
import { useCompare } from "@/hooks/useCompare";
import { fetchProviders } from "@/lib/api";
import type { PaneSelection, Provider, ProviderInfo, Side } from "@/types";

const STORAGE_KEY = "model-arena:selections";
const PROVIDERS: Provider[] = ["groq", "openrouter", "gemini"];

interface SavedSelection {
  provider: Provider;
  model: string;
}

interface SavedSelections {
  a: SavedSelection;
  b: SavedSelection;
}

function isProvider(value: unknown): value is Provider {
  return (
    typeof value === "string" &&
    (PROVIDERS as readonly string[]).includes(value)
  );
}

function readSavedSelections(): SavedSelections | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    const a = record.a;
    const b = record.b;
    if (
      typeof a !== "object" ||
      a === null ||
      typeof b !== "object" ||
      b === null
    ) {
      return null;
    }
    const savedA = a as Record<string, unknown>;
    const savedB = b as Record<string, unknown>;
    if (
      !isProvider(savedA.provider) ||
      typeof savedA.model !== "string" ||
      !isProvider(savedB.provider) ||
      typeof savedB.model !== "string"
    ) {
      return null;
    }
    return {
      a: { provider: savedA.provider, model: savedA.model },
      b: { provider: savedB.provider, model: savedB.model },
    };
  } catch {
    return null;
  }
}

function writeSavedSelections(selections: {
  a: PaneSelection;
  b: PaneSelection;
}): void {
  try {
    const payload: SavedSelections = {
      a: { provider: selections.a.provider, model: selections.a.model },
      b: { provider: selections.b.provider, model: selections.b.model },
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage can be disabled; selections still work for this session.
  }
}

function pickDefault(
  side: Side,
  available: ProviderInfo[],
  saved: SavedSelections | null,
): PaneSelection | null {
  if (available.length === 0) {
    return null;
  }

  const savedSide = saved?.[side];
  if (savedSide && available.some((item) => item.id === savedSide.provider)) {
    return {
      provider: savedSide.provider,
      model: savedSide.model,
      modelName: "",
    };
  }

  const preferred =
    side === "a"
      ? (["groq", "openrouter", "gemini"] as Provider[])
      : (["gemini", "openrouter", "groq"] as Provider[]);
  const provider =
    preferred
      .map((id) => available.find((item) => item.id === id))
      .find((item): item is ProviderInfo => Boolean(item)) ?? available[0];

  return { provider: provider.id, model: "", modelName: "" };
}

export function ArenaShell() {
  const [providers, setProviders] = useState<ProviderInfo[] | null>(null);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [selections, setSelections] = useState<{
    a: PaneSelection | null;
    b: PaneSelection | null;
  }>({ a: null, b: null });
  const [prompt, setPrompt] = useState("");
  const compare = useCompare();

  useEffect(() => {
    const controller = new AbortController();
    fetchProviders(controller.signal)
      .then((list) => {
        if (controller.signal.aborted) {
          return;
        }
        const saved = readSavedSelections();
        const available = list.filter((provider) => provider.available);
        setProviders(list);
        setProviderError(null);
        setSelections({
          a: pickDefault("a", available, saved),
          b: pickDefault("b", available, saved),
        });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setProviders([]);
        setProviderError(
          reason instanceof Error
            ? reason.message
            : "Could not reach the backend.",
        );
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (selections.a && selections.b) {
      writeSavedSelections({ a: selections.a, b: selections.b });
    }
  }, [selections]);

  const handleSelectionChange = useCallback(
    (side: Side, selection: PaneSelection) => {
      setSelections((current) => ({ ...current, [side]: selection }));
    },
    [],
  );

  const canRun =
    Boolean(selections.a?.model) &&
    Boolean(selections.b?.model) &&
    !compare.isStreaming;

  const handleSubmit = useCallback(() => {
    const a = selections.a;
    const b = selections.b;
    const trimmed = prompt.trim();
    if (!a || !b || !a.model || !b.model || !trimmed || compare.isStreaming) {
      return;
    }
    compare.run(
      trimmed,
      { provider: a.provider, model: a.model },
      { provider: b.provider, model: b.model },
    );
  }, [compare, prompt, selections]);

  const handleRunAgain = useCallback(() => {
    const a = selections.a;
    const b = selections.b;
    if (
      !compare.lastPrompt ||
      !a ||
      !b ||
      !a.model ||
      !b.model ||
      compare.isStreaming
    ) {
      return;
    }
    setPrompt(compare.lastPrompt);
    compare.run(
      compare.lastPrompt,
      { provider: a.provider, model: a.model },
      { provider: b.provider, model: b.model },
    );
  }, [compare, selections]);

  const handleClear = useCallback(() => {
    compare.clear();
    setPrompt("");
  }, [compare]);

  const handleExample = useCallback((example: string) => {
    setPrompt(example);
    requestAnimationFrame(() => {
      document.getElementById("arena-prompt")?.focus();
    });
  }, []);

  const availableCount = useMemo(
    () => providers?.filter((provider) => provider.available).length ?? 0,
    [providers],
  );
  const hasResults = compare.a.status !== "idle" || compare.b.status !== "idle";
  const hasAnyApiKey = availableCount > 0;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-line/80 bg-background/75 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span
                className="border-background absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 bg-emerald-500"
                aria-hidden="true"
              />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                Model Arena
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                One prompt. Two free models. Live side by side.
              </p>
            </div>
          </div>

          <div className="border-line bg-panel inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs text-zinc-500 shadow-sm dark:text-zinc-400">
            {providers === null ? (
              <>
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                Checking providers
              </>
            ) : availableCount > 0 ? (
              <>
                <CheckCircle2
                  className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
                {availableCount} of {providers.length} providers ready
              </>
            ) : (
              <>
                <AlertTriangle
                  className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400"
                  aria-hidden="true"
                />
                No API keys configured
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-16 sm:px-6 lg:px-8">
        <section className="border-line bg-panel/80 rounded-3xl border p-4 shadow-sm backdrop-blur sm:p-5">
          <div className="grid gap-3 lg:grid-cols-2">
            <ModelPicker
              side="a"
              providers={providers}
              selection={selections.a}
              disabled={compare.isStreaming}
              onChange={(selection) => handleSelectionChange("a", selection)}
            />
            <ModelPicker
              side="b"
              providers={providers}
              selection={selections.b}
              disabled={compare.isStreaming}
              onChange={(selection) => handleSelectionChange("b", selection)}
            />
          </div>

          <PromptInput
            value={prompt}
            onChange={setPrompt}
            onSubmit={handleSubmit}
            onStop={compare.stop}
            disabled={!canRun && !compare.isStreaming}
            isStreaming={compare.isStreaming}
          />

          {providerError && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <span>
                Could not reach the backend at{" "}
                {process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}.
                Make sure the FastAPI server is running.
              </span>
            </div>
          )}

          {!providerError && providers && !hasAnyApiKey && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <span>
                Add at least one free-tier API key to{" "}
                <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-xs dark:bg-white/10">
                  backend/.env
                </code>{" "}
                and restart the server to enable a provider.
              </span>
            </div>
          )}
        </section>

        {hasResults ? (
          <section className="mt-6" aria-labelledby="results-heading">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <h2
                  id="results-heading"
                  className="text-sm font-semibold tracking-[0.16em] text-zinc-500 uppercase dark:text-zinc-400"
                >
                  Comparison
                </h2>
                {compare.lastPrompt && (
                  <p className="mt-1 max-w-3xl truncate text-sm text-zinc-600 dark:text-zinc-300">
                    {compare.lastPrompt}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRunAgain}
                  disabled={compare.isStreaming || !compare.lastPrompt}
                  className="border-line bg-panel hover:bg-panel-muted focus-visible:outline-accent inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium text-zinc-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-200"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Run again
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={compare.isStreaming}
                  className="border-line bg-panel hover:bg-panel-muted focus-visible:outline-accent inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium text-zinc-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-200"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Clear
                </button>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <ResponsePanel
                side="a"
                selection={selections.a}
                state={compare.a}
              />
              <ResponsePanel
                side="b"
                selection={selections.b}
                state={compare.b}
              />
            </div>
          </section>
        ) : (
          <div className="mt-6">
            <EmptyState onSelectPrompt={handleExample} />
          </div>
        )}
      </main>

      <footer className="border-line/70 border-t px-4 py-4 text-center text-xs text-zinc-400 dark:text-zinc-500">
        Single-turn comparisons only. No history, accounts, or saved prompts.
      </footer>
    </div>
  );
}
