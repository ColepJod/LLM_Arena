"use client";

import { ChevronDown, LoaderCircle } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { fetchModels } from "@/lib/api";
import type {
  ModelInfo,
  PaneSelection,
  Provider,
  ProviderInfo,
  Side,
} from "@/types";

interface ModelPickerProps {
  side: Side;
  providers: ProviderInfo[] | null;
  selection: PaneSelection | null;
  disabled: boolean;
  onChange: (selection: PaneSelection) => void;
}

interface CatalogState {
  provider: Provider | null;
  models: ModelInfo[];
  error: string | null;
}

const EMPTY_MODELS: ModelInfo[] = [];

export function ModelPicker({
  side,
  providers,
  selection,
  disabled,
  onChange,
}: ModelPickerProps) {
  const providerId = useId();
  const modelId = useId();
  const [catalog, setCatalog] = useState<CatalogState>({
    provider: null,
    models: [],
    error: null,
  });
  const selectedProvider = selection?.provider ?? "";
  const catalogReady = catalog.provider === selectedProvider;
  const loading = Boolean(selectedProvider) && !catalogReady;
  const models = catalogReady ? catalog.models : EMPTY_MODELS;
  const error = catalogReady ? catalog.error : null;

  useEffect(() => {
    if (!selectedProvider) {
      return;
    }

    const controller = new AbortController();
    fetchModels(selectedProvider, controller.signal)
      .then((list) => {
        if (!controller.signal.aborted) {
          setCatalog({
            provider: selectedProvider,
            models: list,
            error: null,
          });
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setCatalog({
            provider: selectedProvider,
            models: [],
            error:
              reason instanceof Error
                ? reason.message
                : "Could not load models for this provider.",
          });
        }
      });

    return () => controller.abort();
  }, [selectedProvider]);

  useEffect(() => {
    if (!selection || loading || error || models.length === 0) {
      return;
    }
    const current = models.find((model) => model.id === selection.model);
    if (current) {
      if (current.name !== selection.modelName) {
        onChange({
          provider: selection.provider,
          model: current.id,
          modelName: current.name,
        });
      }
      return;
    }
    const first = models[0];
    onChange({
      provider: selection.provider,
      model: first.id,
      modelName: first.name,
    });
  }, [error, loading, models, onChange, selection]);

  const handleProviderChange = (nextProvider: Provider) => {
    onChange({ provider: nextProvider, model: "", modelName: "" });
  };

  const handleModelChange = (nextModel: string) => {
    if (!selection) {
      return;
    }
    const model = models.find((entry) => entry.id === nextModel);
    if (!model) {
      return;
    }
    onChange({
      provider: selection.provider,
      model: model.id,
      modelName: model.name,
    });
  };

  const unavailableHint = providers?.some((provider) => !provider.available)
    ? "Providers without an API key are disabled. Add keys to backend/.env."
    : undefined;

  return (
    <div className="border-line bg-panel-muted/70 rounded-2xl border p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold ${
              side === "a"
                ? "bg-indigo-600 text-white"
                : "bg-sky-600 text-white"
            }`}
            aria-hidden="true"
          >
            {side.toUpperCase()}
          </span>
          <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Pane {side.toUpperCase()}
          </span>
        </div>
        {loading && (
          <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500">
            <LoaderCircle
              className="h-3.5 w-3.5 animate-spin"
              aria-hidden="true"
            />
            Loading
          </span>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div>
          <label
            htmlFor={providerId}
            className="mb-1 block text-[11px] font-medium tracking-wider text-zinc-400 uppercase dark:text-zinc-500"
          >
            Provider
          </label>
          <div className="relative">
            <select
              id={providerId}
              value={selectedProvider}
              onChange={(event) =>
                handleProviderChange(event.target.value as Provider)
              }
              disabled={disabled || !providers}
              title={unavailableHint}
              className="border-line bg-panel focus:border-accent/60 focus:ring-accent/15 h-9 w-full appearance-none rounded-lg border px-3 pr-8 text-sm text-zinc-800 transition-colors outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-200"
            >
              {!selectedProvider && <option value="">No providers</option>}
              {providers?.map((provider) => (
                <option
                  key={provider.id}
                  value={provider.id}
                  disabled={!provider.available}
                  title={
                    provider.available
                      ? undefined
                      : `${provider.name}: API key not configured`
                  }
                >
                  {provider.name}
                  {provider.available ? "" : " (API key not configured)"}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2 text-zinc-400"
              aria-hidden="true"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor={modelId}
            className="mb-1 block text-[11px] font-medium tracking-wider text-zinc-400 uppercase dark:text-zinc-500"
          >
            Model
          </label>
          <div className="relative">
            <select
              id={modelId}
              value={selection?.model ?? ""}
              onChange={(event) => handleModelChange(event.target.value)}
              disabled={
                disabled || loading || Boolean(error) || models.length === 0
              }
              className="border-line bg-panel focus:border-accent/60 focus:ring-accent/15 h-9 w-full appearance-none rounded-lg border px-3 pr-8 text-sm text-zinc-800 transition-colors outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-200"
            >
              {(!selection?.model || models.length === 0) && (
                <option value="">
                  {error
                    ? "Models unavailable"
                    : loading
                      ? "Loading models..."
                      : "Select a model"}
                </option>
              )}
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2 text-zinc-400"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      {!error && unavailableHint && (
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
          {unavailableHint}
        </p>
      )}
    </div>
  );
}
