import { Lightbulb, Sparkles } from "lucide-react";

const EXAMPLES = [
  "Explain recursion like I'm five, with a tiny example.",
  "Compare REST and GraphQL in a table, then recommend one for a small app.",
  "Write a Python function that debounces calls, with a short explanation.",
  "Draft a concise product update for a feature that slipped by one week.",
];

interface EmptyStateProps {
  onSelectPrompt: (prompt: string) => void;
}

export function EmptyState({ onSelectPrompt }: EmptyStateProps) {
  return (
    <section className="border-line bg-panel/60 rounded-3xl border border-dashed px-5 py-10 text-center shadow-sm backdrop-blur sm:px-10 sm:py-14">
      <div className="bg-accent/10 text-accent ring-accent/20 mx-auto flex h-12 w-12 items-center justify-center rounded-2xl ring-1">
        <Sparkles className="h-6 w-6" aria-hidden="true" />
      </div>
      <h2 className="mt-5 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Put two models head to head
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
        Pick a provider and model for each pane, then send one prompt. Both
        answers stream at the same time so you can compare speed, detail, and
        style.
      </p>

      <div className="mt-8 flex items-center justify-center gap-2 text-xs font-medium tracking-[0.18em] text-zinc-400 uppercase dark:text-zinc-500">
        <Lightbulb className="h-4 w-4" aria-hidden="true" />
        Try an example
      </div>
      <div className="mx-auto mt-4 grid max-w-3xl gap-2 sm:grid-cols-2">
        {EXAMPLES.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onSelectPrompt(prompt)}
            className="group border-line bg-panel hover:border-accent/50 hover:bg-accent/5 focus-visible:outline-accent rounded-xl border px-4 py-3 text-left text-sm leading-6 text-zinc-600 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-zinc-300 dark:hover:text-zinc-50"
          >
            <span className="text-accent mr-2 opacity-70 transition-opacity group-hover:opacity-100">
              &rarr;
            </span>
            {prompt}
          </button>
        ))}
      </div>
    </section>
  );
}
