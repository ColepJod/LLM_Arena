export type Provider = "groq" | "openrouter" | "gemini";

export type Side = "a" | "b";

export type SideStatus = "idle" | "streaming" | "done" | "error";

export interface ProviderInfo {
  id: Provider;
  name: string;
  available: boolean;
}

export interface ProvidersResponse {
  providers: ProviderInfo[];
}

export interface ModelInfo {
  id: string;
  name: string;
}

export interface ModelsResponse {
  provider: Provider;
  models: ModelInfo[];
}

export interface ModelSelection {
  provider: Provider;
  model: string;
}

export interface PaneSelection extends ModelSelection {
  modelName: string;
}

export interface CompareRequest {
  prompt: string;
  a: ModelSelection;
  b: ModelSelection;
}

export interface StartEvent {
  side: Side;
  type: "start";
}

export interface DeltaEvent {
  side: Side;
  type: "delta";
  text: string;
}

export interface DoneEvent {
  side: Side;
  type: "done";
  ttft_ms: number;
  total_ms: number;
  output_chars: number;
}

export interface ErrorEvent {
  side: Side;
  type: "error";
  message: string;
}

export interface ResearchSource {
  title: string;
  url: string;
}

export type ResearchStatus = "searching" | "done" | "error";

export interface ResearchEvent {
  type: "research";
  status: ResearchStatus;
  query: string;
  sources: ResearchSource[];
  message: string | null;
}

export type CompareEvent =
  StartEvent | DeltaEvent | DoneEvent | ErrorEvent | ResearchEvent;

export interface SideMetrics {
  ttftMs: number;
  totalMs: number;
  outputChars: number;
}

export interface SideState {
  status: SideStatus;
  text: string;
  metrics: SideMetrics | null;
  error: string | null;
  stopped: boolean;
}

export interface ResearchState {
  status: ResearchStatus;
  query: string;
  sources: ResearchSource[];
  message: string | null;
}

export interface ComparisonState {
  a: SideState;
  b: SideState;
  lastPrompt: string | null;
  research: ResearchState | null;
}
