// The decision form's two JSON contracts: what the agent writes (questions.json) and what
// comes back (answers.json). scripts/decision_form.mjs enforces both; this file is the
// readable version. Text fields marked (md) accept a small Markdown subset: paragraphs,
// **bold**, *italic*, `code`, fenced code, lists, > quotes, pipe tables, http(s) links.
// Everything is escaped before rendering, so quoting untrusted text is safe.

// ------------------------------------------------------------------ questions.json

export interface FormSpec {
  version: 1;
  /** Unique per round, e.g. "<slug>-grill-r1". Letters, digits, . _ - */
  id: string;
  title: string;
  /** Shown as chips in the header. */
  skill?: string;              // "grill" | "implement"
  slug?: string;
  round?: number;              // 1, 2 …
  flags?: string[];            // ["--no-e2e"]
  /** Prefills "Answering as". */
  owner?: string;
  /** (md) What's being decided, how many questions, what the owner should read first. */
  summary?: string;
  /** Things the agent already settled, shown collapsed so nobody re-asks them. (md) */
  proven?: Array<string | { text: string; evidence?: Evidence[] }>;
  sections: Section[];
}

export interface Section {
  id: string;
  title: string;
  intro?: string;              // (md)
  questions: Question[];
}

export type QuestionType =
  | 'single'    // one option (radio cards) + optional free-text "other"
  | 'multi'     // several options (checkboxes) + optional "other"; min/max
  | 'text'      // one line
  | 'longtext'  // paragraph
  | 'number'    // with unit/min/max/step
  | 'confirm'   // "confirm or override": shows recommendation.value as the default
  | 'rank'      // order the options, top = most important
  | 'upload';   // files: screenshots, mocks, sample data, specs

export interface Question {
  id: string;
  type: QuestionType;
  title: string;
  /** blocking = answer changes the plan's shape; shape = changes part of it; minor. */
  impact?: 'blocking' | 'shape' | 'minor';
  /** Hard to reverse (data, public contracts, auth/tenancy, money, production). Never bulk-accepted; badged in the page. */
  oneWayDoor?: boolean;
  /** (md, one line) What changes in the plan depending on the answer. */
  why?: string;
  /** (md) Everything needed to decide without leaving the page. */
  context?: string;
  evidence?: Evidence[];
  /** single | multi | rank */
  options?: Option[];
  /** Strongly expected wherever a sensible default exists; required for confirm. */
  recommendation?: Recommendation;
  /** single | multi: offer a free-text "something else". Default true. */
  allowOther?: boolean;
  /** false = optional: skipped or blank is fine and isn't re-asked. Default true: a skip comes back next round. */
  required?: boolean;
  /** multi: how many to pick. number: allowed range. */
  min?: number;
  max?: number;
  step?: number;               // number
  unit?: string;               // number: "ms", "rows", "USD"
  placeholder?: string;        // text | longtext | number
  accept?: string;             // upload: ".csv,.png,image/*"
  multiple?: boolean;          // upload: default true
  maxSizeMB?: number;          // upload: default 25, hard cap 200 (offline copy: 10)
  /** Show only while an earlier single/multi question is answered (valid, not skipped) with one of these option ids. Hidden → status "not_applicable"; a submission that answers a hidden question is rejected rather than silently dropped. */
  showIf?: { question: string; in: string[] };
}

export interface Option {
  id: string;
  label: string;               // (md inline)
  description?: string;        // (md)
  /** (md inline) What picking this does to the plan; shown after an arrow. */
  consequence?: string;
  /** Monospace preview: a snippet, schema, payload, UI sketch. */
  preview?: string;
}

export interface Recommendation {
  /** single: option id · multi: option ids · rank: every option id in order ·
   *  number: number · text | longtext | confirm: string (md for confirm/longtext). */
  value: string | number | string[];
  /** (md inline) Why, in one line. Required. */
  reason: string;
}

export interface Evidence {
  /** At least one of label, path, url. */
  label?: string;              // (md inline)
  path?: string;               // repo-relative
  line?: number;               // first line of `code`; numbers the snippet
  endLine?: number;
  lang?: string;
  /** Exact lines copied from the file. Never secrets. */
  code?: string;
  url?: string;                // http(s) only
  note?: string;               // (md inline)
}

// ------------------------------------------------------------------ answers.json

export interface AnswersDoc {
  version: 1;
  formId: string;
  title: string;
  round: number;
  /** served = submitted to decision_form.mjs serve; standalone = downloaded and imported. */
  mode: 'served' | 'standalone';
  /** File name of the questions the round used (normally questions.json). */
  specFile: string;
  /** sha256 of the questions.json bytes the owner answered. served: the file the server
   *  loaded. standalone: the file the offline copy was built from (import refuses a
   *  mismatch). null only for a hand-built page that didn't record it. */
  specSha256: string | null;
  submittedAt: string;
  receivedAt: string;
  /** Trimmed, at most 200 characters. */
  answeredBy: string | null;
  summary: {
    total: number;
    answered: number;
    skipped: number;
    /** Required questions left blank. Like skipped ones, they go back to the owner. */
    unanswered: number;
    optionalLeftBlank: number;
    notApplicable: number;
    acceptedRecommendations: number;
    /** Question ids where the owner chose differently from the recommendation: read these first. */
    overrodeRecommendations: string[];
    /** One-way doors the owner skipped or left blank (also in needsAnswer). */
    oneWayDoorsNotAnswered: string[];
    /** Question ids carrying a note: notes often add conditions to an answer. */
    withNotes: string[];
    /** Required questions skipped or left blank. A skip means "not now", never "you decide":
     *  re-ask these (decision_form.mjs reask) until the list is empty. */
    needsAnswer: string[];
    /** needsAnswer is empty: the round can be recorded as decided. */
    complete: boolean;
  };
  /** In form order, keyed by question id. */
  answers: Record<string, Answer>;
  /** Trimmed, at most 50,000 characters. */
  generalNotes: string | null;
}

export interface Answer {
  n: number;                   // "Q3" in the page
  title: string;
  type: QuestionType;
  status: 'answered' | 'skipped' | 'unanswered' | 'not_applicable';
  impact?: 'blocking' | 'shape' | 'minor';
  oneWayDoor?: true;
  optional?: true;
  /** Present when answered. single: option id or null (then see other) · multi: option ids ·
   *  rank: option ids in order · number: number · text|longtext|confirm: string · upload: UploadedFile[]. */
  value?: string | number | string[] | null | UploadedFile[];
  /** single | multi: the owner's own option. */
  other?: string;
  /** Human-readable form of value for choice, rank, number and upload questions. */
  display?: string;
  /** Whether the answer equals the recommendation; absent when there was none. */
  acceptedRecommendation?: boolean;
  /** The recommendation the owner turned down (only when acceptedRecommendation is false). */
  recommended?: Recommendation['value'];
  /** Owner's note on this question: conditions, caveats. Trimmed, at most 20,000 characters. */
  note?: string;
  /** Why they skipped, or who should decide. Trimmed, at most 4,000 characters. */
  reason?: string;
}

export interface UploadedFile {
  name: string;
  /** Relative to the folder holding answers.json, e.g. "uploads/sample-file/data.csv". */
  path: string;
  size: number;
  type: string;
  sha256: string;
}
