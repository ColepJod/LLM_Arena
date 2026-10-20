"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Globe2,
  LoaderCircle,
} from "lucide-react";

import type { ResearchState } from "@/types";

interface ResearchBannerProps {
  research: ResearchState | null;
}

export function ResearchBanner({ research }: ResearchBannerProps) {
  if (!research) {
    return null;
  }

  const searching = research.status === "searching";
  const failed = research.status === "error";
  const sourceLabel =
    research.sources.length === 1
      ? "1 live source"
      : `${research.sources.length} live sources`;

  return (
    <section
      className="border-line bg-panel/80 mt-3 rounded-2xl border p-3 shadow-sm"
      aria-live="polite"
    >
      <div className="flex items-start gap-2.5">
        <span
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            searching
              ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300"
              : failed
                ? "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300"
                : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300"
          }`}
        >
          {searching ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : failed ? (
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Globe2 className="h-4 w-4" aria-hidden="true" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Live web research
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase ${
                searching
                  ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300"
                  : failed
                    ? "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                    : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
              }`}
            >
              {searching ? "Searching" : failed ? "Skipped" : sourceLabel}
            </span>
          </div>

          {searching && (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Looking for fresh sources before asking both models…
            </p>
          )}

          {failed && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
              {research.message ??
                "Live search was unavailable. The models answered without it."}
            </p>
          )}

          {research.status === "done" && (
            <>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                <CheckCircle2
                  className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
                Added to both prompts so the models can answer with current
                information.
              </p>
              {research.sources.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                  {research.sources.map((source) => (
                    <li key={source.url} className="max-w-full min-w-0">
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-accent inline-flex max-w-full items-center gap-1 text-xs text-zinc-600 underline decoration-zinc-300 underline-offset-2 transition-colors hover:decoration-current dark:text-zinc-300 dark:decoration-zinc-600"
                      >
                        <span className="truncate">{source.title}</span>
                        <ExternalLink
                          className="h-3 w-3 shrink-0"
                          aria-hidden="true"
                        />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
