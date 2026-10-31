// The shape every pipeline stage follows.
// A stage reads earlier stages' files, writes its own, and reports what it did.

export interface StageResult {
  summary: string;     // one line for the console, e.g. "14 turns, 9 gaps"
  costUsd: number;     // estimated API spend for this run of the stage (0 if none)
}

export interface Stage {
  id: string;          // "01", "02", ... used by --from / --to
  name: string;        // "ingest", "transcribe", ...
  // Files whose existence means the stage already ran. The runner skips the
  // stage when all exist, unless --force.
  outputs: (videoId: string) => string[];
  run: (videoId: string) => Promise<StageResult>;
}
