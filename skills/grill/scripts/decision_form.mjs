#!/usr/bin/env node
// Decision form: put the owner's questions in a local browser page, with the context
// to decide each one, and get the answers back as JSON. Node 18+, standard library only.
//
//   node decision_form.mjs validate <form-dir | questions.json>
//   node decision_form.mjs serve    <form-dir> [--port N] [--no-open] [--timeout-min 240] [--force]
//   node decision_form.mjs wait     <form-dir> [--timeout-sec 540]
//   node decision_form.mjs build    <form-dir | questions.json> [--out file.html] [--open]
//   node decision_form.mjs import   <form-dir> <downloaded-answers.json> [--force] [--accept-changed-spec]
//   node decision_form.mjs reask    <round-dir> [--out <next-round-dir>] [--force]
//
// A form dir holds questions.json (written by the agent). `serve` adds answers.json and
// uploads/ when the owner submits, then exits 0. Every command prints one JSON line per
// event on stdout; human hints go to stderr. See references/decision-form.md.
//
// Exit codes: 0 submitted / valid / built · 1 error · 2 wait: still waiting ·
// 3 serve: timed out, wait: no server running · 130 SIGINT · 143 SIGTERM.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INDEX_HTML = path.resolve(HERE, '..', 'assets', 'decision-form', 'index.html');
const SPEC_TAG = '<script id="form-spec" type="application/json"></script>';
const SESSION_FILE = 'form-session.json';

const TYPES = ['single', 'multi', 'text', 'longtext', 'number', 'confirm', 'rank', 'upload'];
const IMPACTS = ['blocking', 'shape', 'minor'];
const STATUSES = ['answered', 'skipped', 'unanswered', 'not_applicable'];
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const MAX_SUBMIT_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_BYTES = 300 * 1024 * 1024;
const DEFAULT_UPLOAD_MB = 25;
const HARD_UPLOAD_MB = 200;
const MAX_TIMEOUT_MIN = 35000; // setTimeout's 2^31 ms ceiling is ~35,791 min
export const LIMITS = { note: 20000, reason: 4000, generalNotes: 50000, answeredBy: 200 };

const TOP_KEYS = new Set(['$schema', 'version', 'id', 'title', 'skill', 'slug', 'round', 'owner', 'flags', 'summary', 'proven', 'sections']);
const SECTION_KEYS = new Set(['id', 'title', 'intro', 'questions']);
const Q_KEYS = new Set(['id', 'type', 'title', 'impact', 'oneWayDoor', 'why', 'context', 'evidence', 'options',
  'recommendation', 'allowOther', 'required', 'min', 'max', 'step', 'unit', 'placeholder', 'accept', 'multiple',
  'maxSizeMB', 'showIf']);
const OPT_KEYS = new Set(['id', 'label', 'description', 'consequence', 'preview']);
const EV_KEYS = new Set(['label', 'path', 'line', 'endLine', 'lang', 'code', 'url', 'note']);
const MIME = {
  '.csv': 'text/csv', '.tsv': 'text/tab-separated-values', '.txt': 'text/plain', '.md': 'text/markdown', '.json': 'application/json',
  '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.zip': 'application/zip',
};

const isStr = (v) => typeof v === 'string' && v.trim() !== '';
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isPosInt = (v) => Number.isInteger(v) && v > 0;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

// ---------------------------------------------------------------- spec validation

export function allQuestions(spec) {
  return (spec.sections || []).flatMap((s) => s.questions || []);
}

function checkEvidence(ev, p, err, warn) {
  if (ev === undefined) return;
  if (!Array.isArray(ev)) return err(p, 'must be an array');
  ev.forEach((e, i) => {
    const ep = `${p}[${i}]`;
    if (!isObj(e)) return err(ep, 'must be an object');
    for (const k of Object.keys(e)) if (!EV_KEYS.has(k)) warn(`${ep}.${k}`, 'unknown field (ignored)');
    if (!isStr(e.label) && !isStr(e.path) && !isStr(e.url)) err(ep, 'needs at least one of label, path, url');
    for (const k of ['label', 'path', 'lang', 'code', 'note']) if (e[k] !== undefined && typeof e[k] !== 'string') err(`${ep}.${k}`, 'must be a string');
    for (const k of ['line', 'endLine']) if (e[k] !== undefined && !isPosInt(e[k])) err(`${ep}.${k}`, 'must be a positive integer');
    if (isPosInt(e.line) && isPosInt(e.endLine) && e.endLine < e.line) err(`${ep}.endLine`, 'must be >= line');
    if (e.url !== undefined && !(typeof e.url === 'string' && /^https?:\/\//i.test(e.url))) err(`${ep}.url`, 'must be an http(s) URL');
  });
}

function validateQuestion(q, p, qById, err, warn) {
  if (!isObj(q)) return err(p, 'must be an object');
  for (const k of Object.keys(q)) if (!Q_KEYS.has(k)) warn(`${p}.${k}`, 'unknown field (ignored)');
  if (!isStr(q.id) || !ID_RE.test(q.id)) err(`${p}.id`, 'required; letters, digits, . _ - (max 120)');
  else if (qById.has(q.id)) err(`${p}.id`, `duplicate question id "${q.id}"`);
  if (!TYPES.includes(q.type)) err(`${p}.type`, `must be one of ${TYPES.join(', ')}`);
  if (!isStr(q.title)) err(`${p}.title`, 'required string');
  if (q.impact !== undefined && !IMPACTS.includes(q.impact)) err(`${p}.impact`, `must be one of ${IMPACTS.join(', ')}`);
  for (const k of ['why', 'context', 'placeholder', 'unit', 'accept']) if (q[k] !== undefined && typeof q[k] !== 'string') err(`${p}.${k}`, 'must be a string');
  for (const k of ['oneWayDoor', 'allowOther', 'required', 'multiple']) if (q[k] !== undefined && typeof q[k] !== 'boolean') err(`${p}.${k}`, 'must be true or false');
  checkEvidence(q.evidence, `${p}.evidence`, err, warn);

  const optIds = new Set();
  if (['single', 'multi', 'rank'].includes(q.type)) {
    const need = q.type === 'multi' ? 1 : 2;
    if (!Array.isArray(q.options) || q.options.length < need) err(`${p}.options`, `${q.type} needs at least ${need} options`);
    else q.options.forEach((o, i) => {
      const op = `${p}.options[${i}]`;
      if (!isObj(o)) return err(op, 'must be an object');
      for (const k of Object.keys(o)) if (!OPT_KEYS.has(k)) warn(`${op}.${k}`, 'unknown field (ignored)');
      if (!isStr(o.id) || !ID_RE.test(o.id)) err(`${op}.id`, 'required id');
      else if (optIds.has(o.id)) err(`${op}.id`, `duplicate option id "${o.id}"`);
      else optIds.add(o.id);
      if (!isStr(o.label)) err(`${op}.label`, 'required string');
      for (const k of ['description', 'consequence', 'preview']) if (o[k] !== undefined && typeof o[k] !== 'string') err(`${op}.${k}`, 'must be a string');
    });
  } else if (q.options !== undefined) warn(`${p}.options`, `ignored for type ${q.type}`);

  if (q.type === 'multi') {
    for (const k of ['min', 'max']) if (q[k] !== undefined && !(Number.isInteger(q[k]) && q[k] >= 0)) err(`${p}.${k}`, 'must be a non-negative integer');
    if (Number.isInteger(q.min) && Number.isInteger(q.max) && q.min > q.max) err(`${p}.min`, 'must be <= max');
    if (Number.isInteger(q.max) && optIds.size && q.max > optIds.size + (q.allowOther === false ? 0 : 1)) warn(`${p}.max`, 'is larger than the number of choices');
  }
  if (q.type === 'number') {
    for (const k of ['min', 'max', 'step']) if (q[k] !== undefined && !isNum(q[k])) err(`${p}.${k}`, 'must be a number');
    if (isNum(q.min) && isNum(q.max) && q.min > q.max) err(`${p}.min`, 'must be <= max');
  }
  if (q.type === 'upload' && q.maxSizeMB !== undefined && !(isNum(q.maxSizeMB) && q.maxSizeMB > 0 && q.maxSizeMB <= HARD_UPLOAD_MB)) {
    err(`${p}.maxSizeMB`, `must be a number between 0 and ${HARD_UPLOAD_MB}`);
  }

  const rp = `${p}.recommendation`;
  if (q.recommendation !== undefined) {
    const r = q.recommendation;
    if (!isObj(r)) err(rp, 'must be {value, reason}');
    else {
      if (!isStr(r.reason)) err(`${rp}.reason`, 'required: say why in one line');
      const v = r.value;
      let shapeOk = true;
      switch (q.type) {
        case 'single': if (!optIds.has(v)) { err(`${rp}.value`, 'must be one of the option ids'); shapeOk = false; } break;
        case 'multi': if (!Array.isArray(v) || !v.length || !v.every((x) => optIds.has(x))) { err(`${rp}.value`, 'must be a non-empty array of option ids'); shapeOk = false; } break;
        case 'rank':
          if (!Array.isArray(v) || v.length !== optIds.size || new Set(v).size !== v.length || !v.every((x) => optIds.has(x))) {
            err(`${rp}.value`, 'must list every option id once, in the recommended order');
            shapeOk = false;
          }
          break;
        case 'number': if (!isNum(v)) { err(`${rp}.value`, 'must be a number'); shapeOk = false; } break;
        case 'upload': err(rp, 'not supported on upload questions'); shapeOk = false; break;
        default: if (!isStr(v)) { err(`${rp}.value`, 'must be a non-empty string'); shapeOk = false; }
      }
      // A recommendation the owner accepts with one click has to be submittable as-is.
      if (shapeOk) {
        const problem = checkValue(q, { value: v });
        if (problem) err(`${rp}.value`, `accepting it would be rejected: ${problem}`);
      }
    }
  } else if (q.type === 'confirm') {
    err(rp, 'confirm questions need {value: "<the default you will use>", reason}');
  } else if (['single', 'multi', 'rank', 'number'].includes(q.type)) {
    warn(rp, 'missing: offer a recommendation so the owner can confirm instead of compose');
  }

  if (q.showIf !== undefined) {
    const s = q.showIf;
    if (!isObj(s) || !isStr(s.question) || !Array.isArray(s.in) || !s.in.length) err(`${p}.showIf`, 'must be {question, in: [option ids]}');
    else {
      const ref = qById.get(s.question);
      if (!ref) err(`${p}.showIf.question`, `"${s.question}" is not a question earlier in the form`);
      else if (ref.type !== 'single' && ref.type !== 'multi') err(`${p}.showIf.question`, 'can only depend on a single or multi question');
      else {
        const ids = new Set((ref.options || []).map((o) => o.id));
        for (const x of s.in) if (!ids.has(x)) err(`${p}.showIf.in`, `"${x}" is not an option of ${s.question}`);
      }
    }
  }
  if (isStr(q.id) && !qById.has(q.id)) qById.set(q.id, q);
}

export function validateSpec(spec) {
  const errors = [];
  const warnings = [];
  const err = (p, m) => errors.push(`${p}: ${m}`);
  const warn = (p, m) => warnings.push(`${p}: ${m}`);
  if (!isObj(spec)) return { errors: ['$: must be a JSON object'], warnings };
  for (const k of Object.keys(spec)) if (!TOP_KEYS.has(k)) warn(`$.${k}`, 'unknown field (ignored)');
  if (spec.version !== 1) err('$.version', 'must be 1');
  if (!isStr(spec.id) || !ID_RE.test(spec.id)) err('$.id', 'required; letters, digits, . _ - (max 120)');
  if (!isStr(spec.title)) err('$.title', 'required string');
  if (spec.round !== undefined && !isPosInt(spec.round)) err('$.round', 'must be an integer >= 1');
  if (spec.flags !== undefined && !(Array.isArray(spec.flags) && spec.flags.every((f) => typeof f === 'string'))) err('$.flags', 'must be an array of strings');
  for (const k of ['skill', 'slug', 'owner', 'summary']) if (spec[k] !== undefined && typeof spec[k] !== 'string') err(`$.${k}`, 'must be a string');
  if (spec.proven !== undefined) {
    if (!Array.isArray(spec.proven)) err('$.proven', 'must be an array');
    else spec.proven.forEach((p, i) => {
      if (typeof p === 'string') return;
      if (!isObj(p) || !isStr(p.text)) return err(`$.proven[${i}]`, 'must be a string or {text, evidence?}');
      checkEvidence(p.evidence, `$.proven[${i}].evidence`, err, warn);
    });
  }
  if (!Array.isArray(spec.sections) || !spec.sections.length) {
    err('$.sections', 'required non-empty array');
    return { errors, warnings };
  }
  const qById = new Map();
  const sectionIds = new Set();
  spec.sections.forEach((s, si) => {
    const sp = `$.sections[${si}]`;
    if (!isObj(s)) return err(sp, 'must be an object');
    for (const k of Object.keys(s)) if (!SECTION_KEYS.has(k)) warn(`${sp}.${k}`, 'unknown field (ignored)');
    if (!isStr(s.id) || !ID_RE.test(s.id)) err(`${sp}.id`, 'required id');
    else if (sectionIds.has(s.id)) err(`${sp}.id`, `duplicate section id "${s.id}"`);
    else sectionIds.add(s.id);
    if (!isStr(s.title)) err(`${sp}.title`, 'required string');
    if (s.intro !== undefined && typeof s.intro !== 'string') err(`${sp}.intro`, 'must be a string');
    if (!Array.isArray(s.questions) || !s.questions.length) return err(`${sp}.questions`, 'required non-empty array');
    s.questions.forEach((q, qi) => validateQuestion(q, `${sp}.questions[${qi}]`, qById, err, warn));
  });
  for (const q of qById.values()) {
    if (q.oneWayDoor && q.type === 'confirm') warn(`question ${q.id}`, 'a one-way door belongs in a full question, not the confirm-or-override list');
  }
  const n = qById.size;
  if (n > 15) warn('$.sections', `${n} questions: past ~10 real questions a pass gets skimmed; move low-stakes items into confirm questions`);
  return { errors, warnings };
}

// ---------------------------------------------------------------- answers

function sameSet(a, b) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

// Mirrors visible() in the page: a follow-up shows only while its parent is answered
// (and itself visible) with one of the listed options.
function isVisible(q, answers, byId) {
  if (!q.showIf) return true;
  const dep = byId.get(q.showIf.question);
  const a = dep && answers[dep.id];
  if (!dep || !a || a.status !== 'answered' || !isVisible(dep, answers, byId)) return false;
  const vals = Array.isArray(a.value) ? a.value : [a.value];
  return vals.some((v) => q.showIf.in.includes(v));
}

function checkValue(q, a) {
  const ids = new Set((q.options || []).map((o) => o.id));
  const v = a.value;
  const other = isStr(a.other);
  if (other && !['single', 'multi'].includes(q.type)) return '"other" is only for single and multi questions';
  if (other && q.allowOther === false) return '"other" is turned off for this question';
  switch (q.type) {
    case 'single':
      if (v === null || v === undefined) return other ? null : 'pick an option, or give "other" text';
      return ids.has(v) && !other ? null : 'value must be one option id (or null with "other" text)';
    case 'multi': {
      if (!Array.isArray(v) || !v.every((x) => ids.has(x)) || new Set(v).size !== v.length) return 'value must be an array of distinct option ids';
      const n = v.length + (other ? 1 : 0);
      if (!n) return 'pick at least one';
      if (Number.isInteger(q.min) && n < q.min) return `pick at least ${q.min}`;
      if (Number.isInteger(q.max) && n > q.max) return `pick at most ${q.max}`;
      return null;
    }
    case 'rank':
      return Array.isArray(v) && v.length === ids.size && new Set(v).size === v.length && v.every((x) => ids.has(x))
        ? null : 'value must list every option id once';
    case 'number':
      if (!isNum(v)) return 'value must be a number';
      if (isNum(q.min) && v < q.min) return `must be >= ${q.min}`;
      if (isNum(q.max) && v > q.max) return `must be <= ${q.max}`;
      return null;
    case 'upload':
      if (!Array.isArray(v) || !v.length) return 'value must be a non-empty array of files';
      if (q.multiple === false && v.length > 1) return 'this question takes one file';
      return null;
    default:
      return isStr(v) ? null : 'value must be a non-empty string';
  }
}

function recommendationAccepted(q, a) {
  const r = q.recommendation;
  if (!r) return null;
  const v = a.value;
  if (isStr(a.other)) return false;
  switch (q.type) {
    case 'single': case 'number': return v === r.value;
    case 'multi': return sameSet(v, r.value);
    case 'rank': return v.length === r.value.length && v.every((x, i) => x === r.value[i]);
    case 'upload': return null;
    default: return String(v).trim() === String(r.value).trim();
  }
}

function displayOf(q, a) {
  const label = (id) => (q.options || []).find((o) => o.id === id)?.label ?? id;
  const other = isStr(a.other) ? `Other: ${a.other.trim()}` : null;
  switch (q.type) {
    case 'single': return other ?? label(a.value);
    case 'multi': return [...a.value.map(label), ...(other ? [other] : [])].join('; ');
    case 'rank': return a.value.map((id, i) => `${i + 1}. ${label(id)}`).join('  ');
    case 'number': return q.unit ? `${a.value} ${q.unit}` : String(a.value);
    case 'upload': return a.value.map((f) => f.name).join(', ');
    default: return undefined;
  }
}

const clip = (s, n) => s.trim().slice(0, n);

// Normalize a submission from the page (or a downloaded standalone file) into the answers
// document. Recomputes everything derivable (visibility, accepted recommendation, display,
// counts) so the agent never has to trust the browser's arithmetic.
export async function finalize(spec, sub, { mode, resolveFile, specSha256 = null, specFile = 'questions.json' }) {
  const errors = [];
  if (!isObj(sub)) return { errors: ['body must be a JSON object'] };
  if (sub.formId !== spec.id) errors.push(`formId must be "${spec.id}", got ${JSON.stringify(sub.formId)}`);
  if (!isObj(sub.answers)) return { errors: [...errors, 'answers must be an object'] };
  const qs = allQuestions(spec);
  const byId = new Map(qs.map((q) => [q.id, q]));
  for (const k of Object.keys(sub.answers)) if (!byId.has(k)) errors.push(`answers.${k}: not a question in this form`);

  const raw = {};
  for (const q of qs) {
    const a = own(sub.answers, q.id) ? sub.answers[q.id] : undefined;
    if (a === undefined) { raw[q.id] = { status: 'unanswered' }; continue; }
    if (!isObj(a) || !STATUSES.includes(a.status)) { errors.push(`answers.${q.id}.status: must be one of ${STATUSES.join(', ')}`); continue; }
    raw[q.id] = a;
  }
  if (errors.length) return { errors };

  const out = {};
  const files = [];
  let n = 0;
  for (const q of qs) {
    n += 1;
    let a = raw[q.id];
    if (!isVisible(q, raw, byId)) {
      // Never drop an answer silently: an answered follow-up whose parent doesn't show it
      // means the page and the server disagree, and the owner's answer would vanish.
      if (a.status === 'answered' || a.status === 'skipped') {
        errors.push(`answers.${q.id}: ${a.status}, but it only applies when ${q.showIf.question} is answered with ${q.showIf.in.join(' or ')}`);
        continue;
      }
      a = { status: 'not_applicable' };
    } else if (a.status === 'not_applicable') a = { status: 'unanswered' };
    const entry = { n, title: q.title, type: q.type, status: a.status };
    if (q.oneWayDoor) entry.oneWayDoor = true;
    if (q.required === false) entry.optional = true;
    if (q.impact) entry.impact = q.impact;
    if (a.status === 'answered') {
      const problem = checkValue(q, a);
      if (problem) { errors.push(`answers.${q.id}: ${problem}`); continue; }
      let value = a.value;
      if (q.type === 'upload') {
        value = [];
        for (const f of a.value) {
          try { value.push(await resolveFile(q, f)); } catch (e) { errors.push(`answers.${q.id}: ${e.message}`); }
        }
        files.push(...value);
      }
      if (q.type === 'text' || q.type === 'longtext' || q.type === 'confirm') value = value.trim();
      entry.value = value;
      if (isStr(a.other)) entry.other = a.other.trim();
      const display = displayOf(q, { ...a, value });
      if (display !== undefined) entry.display = display;
      const acc = recommendationAccepted(q, { ...a, value });
      if (acc !== null) entry.acceptedRecommendation = acc;
      if (q.recommendation && acc === false) entry.recommended = q.recommendation.value;
    }
    if (a.status === 'skipped' && isStr(a.reason)) entry.reason = clip(a.reason, LIMITS.reason);
    if (a.status !== 'not_applicable' && isStr(a.note)) entry.note = clip(a.note, LIMITS.note);
    out[q.id] = entry;
  }
  if (errors.length) return { errors };

  const list = Object.entries(out);
  const ids = (pred) => list.filter(([, e]) => pred(e)).map(([id]) => id);
  const summary = {
    total: list.length,
    answered: ids((e) => e.status === 'answered').length,
    skipped: ids((e) => e.status === 'skipped').length,
    unanswered: ids((e) => e.status === 'unanswered' && !e.optional).length,
    optionalLeftBlank: ids((e) => e.status === 'unanswered' && e.optional).length,
    notApplicable: ids((e) => e.status === 'not_applicable').length,
    acceptedRecommendations: ids((e) => e.acceptedRecommendation === true).length,
    overrodeRecommendations: ids((e) => e.acceptedRecommendation === false),
    oneWayDoorsNotAnswered: ids((e) => e.oneWayDoor && (e.status === 'skipped' || e.status === 'unanswered')),
    withNotes: ids((e) => typeof e.note === 'string'),
    // A skip is "not now", never "you decide": every required question the owner skipped
    // or left blank goes back to them (see `reask`). The round is complete only when empty.
    needsAnswer: ids((e) => !e.optional && (e.status === 'skipped' || e.status === 'unanswered')),
  };
  summary.complete = summary.needsAnswer.length === 0;
  const now = new Date().toISOString();
  const doc = {
    version: 1,
    formId: spec.id,
    title: spec.title,
    round: spec.round ?? 1,
    mode,
    specFile,
    specSha256,
    submittedAt: typeof sub.submittedAt === 'string' ? sub.submittedAt : now,
    receivedAt: now,
    answeredBy: isStr(sub.answeredBy) ? clip(sub.answeredBy, LIMITS.answeredBy) : null,
    summary,
    answers: out,
    generalNotes: isStr(sub.generalNotes) ? clip(sub.generalNotes, LIMITS.generalNotes) : null,
  };
  return { errors: [], doc, files };
}

// ---------------------------------------------------------------- helpers

function emit(event) {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function hint(msg) {
  process.stderr.write(`${msg}\n`);
}

let onFatal = null; // serve installs its cleanup here
function die(msg, extra = {}) {
  if (onFatal) { const f = onFatal; onFatal = null; f(); }
  emit({ event: 'error', message: msg, ...extra });
  hint(`error: ${msg}`);
  for (const e of extra.errors || []) hint(`  - ${e}`);
  process.exit(1);
}

const VALUE_FLAGS = ['port', 'timeout-min', 'timeout-sec', 'out'];
function parseArgs(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const k = eq < 0 ? a.slice(2) : a.slice(2, eq);
      if (eq >= 0) flags[k] = a.slice(eq + 1);
      else if (VALUE_FLAGS.includes(k) && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) flags[k] = argv[++i];
      else flags[k] = true;
    } else pos.push(a);
  }
  return { pos, flags };
}

function numFlag(flags, name, { def, min, max, integer = false }) {
  if (flags[name] === undefined) return def;
  const raw = flags[name];
  const v = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  if (!Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v))) {
    die(`--${name} must be ${integer ? 'an integer' : 'a number'} from ${min} to ${max}, got ${JSON.stringify(raw)}`);
  }
  return v;
}

function resolveSpecPath(target) {
  if (!target) die('missing <form-dir>');
  const abs = path.resolve(target);
  if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) return { dir: abs, specPath: path.join(abs, 'questions.json') };
  return { dir: path.dirname(abs), specPath: abs };
}

function loadSpec(specPath) {
  let text;
  try { text = fs.readFileSync(specPath, 'utf8'); } catch { die(`cannot read ${specPath}`); }
  let spec;
  try { spec = JSON.parse(text); } catch (e) { die(`${specPath} is not valid JSON: ${e.message}`); }
  const { errors, warnings } = validateSpec(spec);
  if (errors.length) die(`${specPath} has ${errors.length} problem(s)`, { errors, warnings });
  for (const w of warnings) hint(`warning: ${w}`);
  return { spec, text, warnings, sha: sha256(text), specFile: path.basename(specPath) };
}

function writeJsonAtomic(file, data, mode = 0o644) {
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(3).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode, flag: 'wx' });
  fs.renameSync(tmp, file);
}

function safeName(name) {
  const base = path.basename(String(name || 'file').replace(/\\/g, '/')).normalize('NFC');
  const clean = base.replace(/[^\p{L}\p{N}._ ()[\]+,@&-]+/gu, '_').replace(/^[.\s]+/, '').slice(0, 120).trim();
  return clean && !clean.endsWith('.part') ? clean : `${clean || 'file'}_`;
}

function uniquePath(dir, name) {
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  let candidate = path.join(dir, name);
  for (let i = 2; fs.existsSync(candidate); i += 1) candidate = path.join(dir, `${stem}-${i}${ext}`);
  return candidate;
}

// Create uploads/<question>/ and make sure no symlink along the way points it outside the
// form folder, so an upload or import can never write elsewhere.
function questionDir(dir, qid) {
  const qDir = path.join(dir, 'uploads', qid);
  fs.mkdirSync(qDir, { recursive: true });
  const real = fs.realpathSync(qDir);
  const root = fs.realpathSync(dir);
  for (const p of [path.join(dir, 'uploads'), qDir]) {
    if (fs.lstatSync(p).isSymbolicLink()) throw Object.assign(new Error(`${rel(dir, p)} is a symlink; refusing to write through it`), { status: 500 });
  }
  if (!real.startsWith(root + path.sep)) throw Object.assign(new Error('uploads folder resolves outside the form folder'), { status: 500 });
  return qDir;
}

const rel = (dir, p) => path.relative(dir, p).split(path.sep).join('/');
const mimeOf = (name) => MIME[path.extname(name).toLowerCase()] || 'application/octet-stream';

function openBrowser(url) {
  const [cmd, args, opts] = process.platform === 'darwin' ? ['open', [url], {}]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', `"${url}"`], { windowsVerbatimArguments: true }]
      : ['xdg-open', [url], {}];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true, ...opts });
    child.on('error', () => hint(`could not open a browser; open ${url} yourself`));
    child.unref();
  } catch { hint(`could not open a browser; open ${url} yourself`); }
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

// A session file counts only while its server is alive and inside its own deadline; a
// file left by a crash (kill -9, OOM, reboot) is stale.
function readSession(sessionPath) {
  let s;
  try { s = JSON.parse(fs.readFileSync(sessionPath, 'utf8')); } catch { return null; }
  if (!isObj(s)) return null;
  const live = pidAlive(s.pid) && !(s.expiresAt && Date.parse(s.expiresAt) < Date.now());
  return { ...s, live };
}

function guardAnswered(dir, force) {
  const answersPath = path.join(dir, 'answers.json');
  if (fs.existsSync(answersPath)) {
    if (!force) die(`${answersPath} already exists: this round was answered. Put the next round in a new folder (round-2/), or pass --force to redo it.`);
    // Move the old round aside, so `wait` can't mistake it for the new submit.
    const aside = path.join(dir, `answers.replaced-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.renameSync(answersPath, aside);
    hint(`moved the previous answers to ${aside}`);
  }
  return answersPath;
}

// ---------------------------------------------------------------- commands

function cmdValidate(target) {
  const { specPath } = resolveSpecPath(target);
  const { spec, warnings } = loadSpec(specPath);
  emit({ event: 'valid', spec: specPath, questions: allQuestions(spec).length, warnings });
}

function scriptHash(html) {
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) die(`${INDEX_HTML} has no inline <script>`);
  return `'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`;
}

async function cmdServe(target, flags) {
  const { dir, specPath } = resolveSpecPath(target);
  const { spec, sha, specFile } = loadSpec(specPath);
  const timeoutMin = numFlag(flags, 'timeout-min', { def: 240, min: 0.01, max: MAX_TIMEOUT_MIN });
  const explicitPort = flags.port !== undefined;
  const portFlag = numFlag(flags, 'port', { def: 0, min: 0, max: 65535, integer: true });
  const sessionPath = path.join(dir, SESSION_FILE);

  // One server per form folder: a live session wins, a stale one is taken over.
  const existing = readSession(sessionPath);
  if (existing?.live && existing.pid !== process.pid) die(`this form is already being served at ${existing.url} (pid ${existing.pid})`);
  fs.rmSync(sessionPath, { force: true });
  try {
    fs.writeFileSync(sessionPath, `${JSON.stringify({ pid: process.pid, starting: true })}\n`, { flag: 'wx', mode: 0o600 });
  } catch (e) {
    die(e.code === 'EEXIST' ? 'another server claimed this form at the same moment; run serve once' : e.message);
  }
  const ownsSession = () => readSession(sessionPath)?.pid === process.pid;
  const releaseSession = () => { if (ownsSession()) fs.rmSync(sessionPath, { force: true }); };
  onFatal = releaseSession;
  process.on('uncaughtException', (e) => die(e.message));

  const answersPath = guardAnswered(dir, flags.force);
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  const csp = `default-src 'none'; script-src ${scriptHash(html)}; style-src 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
  const token = crypto.randomBytes(18).toString('hex');
  const tokenBuf = Buffer.from(token);
  const byId = new Map(allQuestions(spec).map((q) => [q.id, q]));
  const uploaded = new Map(); // relative path -> file meta
  let port = 0;
  let done = false;
  let submitting = false;

  const send = (res, status, body, headers = {}) => {
    const isJson = typeof body !== 'string';
    res.writeHead(status, {
      'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    });
    res.end(isJson ? JSON.stringify(body) : body);
  };

  // Over the limit, stop keeping chunks but drain the rest, so the client reads a clean 413
  // instead of a reset connection. Only a body far past the limit gets cut off.
  const readBody = (req, limit, what) => new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const tooBig = () => Object.assign(new Error(`${what} is over ${Math.round(limit / 1048576)} MB`), { status: 413 });
    req.on('data', (c) => {
      size += c.length;
      if (size <= limit) chunks.push(c);
      else if (size > limit * 4) { reject(tooBig()); req.destroy(); }
    });
    req.on('end', () => (size > limit ? reject(tooBig()) : resolve(Buffer.concat(chunks))));
    req.on('error', reject);
  });

  const finish = (event, code, extra = {}) => {
    if (done) return;
    done = true;
    releaseSession();
    emit({ event, ...extra });
    process.exitCode = code;
    server.close();
    server.closeAllConnections?.();
    // Not unref'd: the exit code must survive even if the loop would drain first.
    setTimeout(() => process.exit(code), 100);
  };

  const handleUpload = async (req, res, u) => {
    const q = byId.get(u.searchParams.get('q') || '');
    if (!q || q.type !== 'upload') return send(res, 400, { error: 'q must be an upload question id' });
    const limitMB = Math.min(q.maxSizeMB ?? DEFAULT_UPLOAD_MB, HARD_UPLOAD_MB);
    const limit = limitMB * 1048576;
    const tooBig = { error: `file is over ${limitMB} MB` };
    // Refuse early on a declared size; Node drains the unread body, so the client still reads the 413.
    if (Number(req.headers['content-length']) > limit) return send(res, 413, tooBig);
    const qDir = questionDir(dir, q.id);
    const file = uniquePath(qDir, safeName(u.searchParams.get('name')));
    const part = `${file}.${crypto.randomBytes(4).toString('hex')}.part`;
    const out = fs.createWriteStream(part, { flags: 'wx' });
    const hash = crypto.createHash('sha256');
    let size = 0;
    let over = false;
    try {
      await new Promise((resolve, reject) => {
        req.on('data', (c) => {
          size += c.length;
          if (size > limit) { over = true; if (size > limit * 4) req.destroy(); return; }
          hash.update(c);
          if (!out.write(c)) { req.pause(); out.once('drain', () => req.resume()); }
        });
        req.on('end', resolve);
        req.on('close', resolve); // also settles when an oversize body is cut off
        req.on('error', reject);
        out.on('error', reject);
      });
    } finally {
      await new Promise((r) => out.end(r));
    }
    if (over || !size) {
      fs.rmSync(part, { force: true });
      return send(res, over ? 413 : 400, over ? tooBig : { error: 'empty file' });
    }
    fs.renameSync(part, file);
    const meta = {
      name: path.basename(file),
      path: rel(dir, file),
      size,
      type: String(req.headers['content-type'] || mimeOf(file)).slice(0, 200),
      sha256: hash.digest('hex'),
    };
    uploaded.set(meta.path, { ...meta, question: q.id });
    return send(res, 200, meta);
  };

  const handleSubmit = async (req, res) => {
    let sub;
    try { sub = JSON.parse((await readBody(req, MAX_SUBMIT_BYTES, 'the submission')).toString('utf8')); } catch (e) {
      return send(res, e.status || 400, { error: e.status ? e.message : 'body is not valid JSON' });
    }
    const resolveFile = async (q, f) => {
      const meta = isObj(f) && typeof f.path === 'string' && uploaded.get(f.path);
      if (!meta || meta.question !== q.id) throw new Error(`file ${JSON.stringify(f?.name || f?.path)} is not on the server any more; remove it and attach it again`);
      const { question, ...clean } = meta;
      return clean;
    };
    const { errors, doc, files } = await finalize(spec, sub, { mode: 'served', resolveFile, specSha256: sha, specFile });
    if (errors.length) return send(res, 400, { errors });
    // From here to the response everything is synchronous, so a second submit can't interleave.
    if (submitting || done) return send(res, 409, { error: 'this form was already submitted' });
    submitting = true;
    try { writeJsonAtomic(answersPath, doc); } catch (e) { submitting = false; throw e; }
    const keep = new Set(files.map((f) => f.path));
    for (const p of [...uploaded.keys()]) {
      if (!keep.has(p)) { fs.rmSync(path.join(dir, p), { force: true }); uploaded.delete(p); }
    }
    res.on('finish', () => finish('submitted', 0, { answers: answersPath, summary: doc.summary }));
    return send(res, 200, { ok: true, path: rel(process.cwd(), answersPath), summary: doc.summary, doc });
  };

  const server = http.createServer(async (req, res) => {
    try {
      const allowed = [`127.0.0.1:${port}`, `localhost:${port}`];
      if (!allowed.includes(req.headers.host)) return send(res, 403, 'forbidden host');
      const u = new URL(req.url, `http://${req.headers.host}`);
      if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/index.html')) {
        return send(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': csp, 'Referrer-Policy': 'no-referrer' });
      }
      if (u.pathname === '/favicon.ico') return send(res, 204, '');
      if (!u.pathname.startsWith('/api/')) return send(res, 404, 'not found');
      const origin = req.headers.origin;
      if (origin && !allowed.some((h) => origin === `http://${h}`)) return send(res, 403, { error: 'forbidden origin' });
      const given = Buffer.from(String(req.headers['x-form-token'] || ''));
      if (given.length !== tokenBuf.length || !crypto.timingSafeEqual(given, tokenBuf)) {
        return send(res, 403, { error: 'bad or missing token: open the exact URL the agent gave you' });
      }
      if (done || submitting) return send(res, 409, { error: 'this form was already submitted' });
      if (req.method === 'GET' && u.pathname === '/api/spec') {
        return send(res, 200, {
          spec, mode: 'served', saveDir: rel(process.cwd(), dir) || '.', maxUploadMB: DEFAULT_UPLOAD_MB,
          uploads: [...uploaded.values()].map(({ question, path: p }) => ({ question, path: p })),
        });
      }
      if (req.method === 'POST' && u.pathname === '/api/upload') return await handleUpload(req, res, u);
      if (req.method === 'POST' && u.pathname === '/api/submit') return await handleSubmit(req, res);
      return send(res, 404, { error: 'not found' });
    } catch (e) {
      if (!res.headersSent) send(res, e.status || 500, { error: e.message });
      return undefined;
    }
  });

  // Files a previous run of this same form already saved stay usable (the page restores
  // them from its draft), so register what's on disk before taking requests. Only regular
  // files count: a symlink planted under uploads/ is never followed.
  for (const q of byId.values()) {
    if (q.type !== 'upload') continue;
    const qDir = path.join(dir, 'uploads', q.id);
    if (!fs.existsSync(qDir) || !fs.lstatSync(qDir).isDirectory()) continue;
    for (const name of fs.readdirSync(qDir)) {
      const file = path.join(qDir, name);
      if (name.endsWith('.part')) { fs.rmSync(file, { force: true }); continue; }
      if (!fs.lstatSync(file).isFile()) continue;
      const body = fs.readFileSync(file);
      uploaded.set(rel(dir, file), { name, path: rel(dir, file), size: body.length, type: mimeOf(name), sha256: sha256(body), question: q.id });
    }
  }

  // Drafts live in the browser's localStorage, which is per origin (port included). A port
  // derived from the form id keeps the same origin across restarts, so a draft survives.
  const preferred = explicitPort ? portFlag : 41000 + (parseInt(sha256(spec.id).slice(0, 8), 16) % 8000);
  let triedRandom = false;
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE' && !explicitPort && !triedRandom) {
      triedRandom = true;
      hint(`port ${preferred} is busy; using a random one (a draft saved in the browser will not carry over)`);
      server.listen(0, '127.0.0.1');
      return;
    }
    die(e.code === 'EADDRINUSE' ? `port ${portFlag} is in use; drop --port to pick a free one` : e.message);
  });
  server.on('listening', () => {
    port = server.address().port;
    const url = `http://127.0.0.1:${port}/?t=${token}`;
    const expiresAt = new Date(Date.now() + timeoutMin * 60000).toISOString();
    writeJsonAtomic(sessionPath, { url, pid: process.pid, answers: answersPath, expiresAt }, 0o600);
    emit({ event: 'ready', url, port, dir, answers: answersPath, questions: byId.size, expiresAt });
    hint(`Decision form ready: ${url}\nWaiting for the owner to submit (Ctrl-C to stop; gives up at ${expiresAt}).`);
    if (!flags['no-open']) openBrowser(url);
  });
  server.listen(preferred, '127.0.0.1');

  setTimeout(() => finish('timeout', 3, { answers: null, message: `nobody submitted within ${timeoutMin} min` }), timeoutMin * 60000).unref();
  process.on('SIGINT', () => finish('stopped', 130, { signal: 'SIGINT' }));
  process.on('SIGTERM', () => finish('stopped', 143, { signal: 'SIGTERM' }));
  // An agent's shell may hang up when its turn ends; the owner is still answering.
  process.on('SIGHUP', () => hint('ignoring SIGHUP; the form keeps running until submit, timeout, SIGINT or SIGTERM'));
}

async function cmdWait(target, flags) {
  const { dir } = resolveSpecPath(target);
  const answersPath = path.join(dir, 'answers.json');
  const sessionPath = path.join(dir, SESSION_FILE);
  const deadline = Date.now() + numFlag(flags, 'timeout-sec', { def: 540, min: 1, max: 86400 }) * 1000;
  let sawSession = false;
  let missingSince = null;
  let badSince = null;
  for (;;) {
    if (fs.existsSync(answersPath)) {
      try {
        const doc = JSON.parse(fs.readFileSync(answersPath, 'utf8'));
        emit({ event: 'submitted', answers: answersPath, summary: doc.summary });
        return process.exit(0);
      } catch {
        badSince ??= Date.now(); // a write in flight is renamed into place, so this rarely lasts
        if (Date.now() - badSince > 3000) die(`${answersPath} is not valid JSON`);
      }
    }
    const session = readSession(sessionPath);
    if (session?.live) { sawSession = true; missingSince = null; } else {
      missingSince ??= Date.now();
      const grace = sawSession || session ? 2000 : 8000;
      if (Date.now() - missingSince > grace || Date.now() > deadline) {
        emit({ event: 'not-running', message: session ? 'the server that wrote form-session.json is gone (crashed or expired); serve again' : 'no server is serving this form and no answers.json exists' });
        return process.exit(3);
      }
    }
    if (Date.now() > deadline) {
      emit({ event: 'waiting', message: 'still waiting for the owner; run wait again' });
      return process.exit(2);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

function cmdBuild(target, flags) {
  const { spec, sha } = loadSpec(resolveSpecPath(target).specPath);
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  if (!html.includes(SPEC_TAG)) die(`${INDEX_HTML} is missing the ${SPEC_TAG} placeholder`);
  // Escape "<" so no string in the spec can close the script tag or open a comment.
  const json = JSON.stringify(spec).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const tag = `<script id="form-spec" type="application/json" data-sha256="${sha}">${json}</script>`;
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${scriptHash(html)}; style-src 'unsafe-inline'; img-src data: blob:; base-uri 'none'; form-action 'none'">`;
  const built = html.replace(SPEC_TAG, () => tag).replace('<meta charset="utf-8">', () => `<meta charset="utf-8">\n${csp}`);
  let out;
  if (typeof flags.out === 'string' && flags.out) out = path.resolve(flags.out);
  else out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'decision-form-')), `${spec.id}.html`);
  fs.writeFileSync(out, built, { mode: 0o600 });
  const url = pathToFileURL(out).href;
  emit({ event: 'built', html: out, url, specSha256: sha });
  if (flags.open) openBrowser(url);
}

async function cmdImport(target, file, flags) {
  if (!file) die('usage: import <form-dir> <downloaded-answers.json>');
  const { dir, specPath } = resolveSpecPath(target);
  const { spec, sha, specFile } = loadSpec(specPath);
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  if (!stat) die(`cannot read ${file}`);
  if (stat.size > MAX_IMPORT_BYTES) die(`${file} is over ${MAX_IMPORT_BYTES / 1048576} MB`);
  let sub;
  try { sub = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { die(`${file} is not valid JSON: ${e.message}`); }
  // The offline copy records which questions.json it was built from. If the file changed
  // since, the owner answered different wording than the one on disk now.
  let specSha256 = sha;
  if (typeof sub?.specSha256 === 'string') {
    if (sub.specSha256 !== sha && !flags['accept-changed-spec']) {
      die(`${specFile} changed after the offline copy was built, so these answers are to other wording. Rebuild and ask again, or pass --accept-changed-spec if the change was cosmetic.`);
    }
    specSha256 = sub.specSha256;
  } else {
    specSha256 = null;
    hint('warning: the download does not say which questions.json it answered (hand-built page?); specSha256 is recorded as null');
  }
  const answersPath = path.join(dir, 'answers.json');
  if (fs.existsSync(answersPath) && !flags.force) guardAnswered(dir, false); // dies with the round-2 hint
  const written = [];
  const resolveFile = async (q, f) => {
    const m = isObj(f) && typeof f.dataUrl === 'string' && f.dataUrl.match(/^data:([^;,]*)(;base64)?,(.*)$/s);
    if (!m) throw new Error('standalone uploads must carry a dataUrl');
    let body;
    try { body = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3])); } catch { throw new Error(`${f.name}: malformed dataUrl`); }
    const limitMB = Math.min(q.maxSizeMB ?? DEFAULT_UPLOAD_MB, HARD_UPLOAD_MB);
    if (!body.length) throw new Error(`${f.name}: empty file`);
    if (body.length > limitMB * 1048576) throw new Error(`${f.name} is over ${limitMB} MB`);
    const out = uniquePath(questionDir(dir, q.id), safeName(f.name));
    fs.writeFileSync(out, body, { flag: 'wx' });
    written.push(out);
    return {
      name: path.basename(out),
      path: rel(dir, out),
      size: body.length,
      type: (m[1] || f.type || mimeOf(out)).slice(0, 200),
      sha256: sha256(body),
    };
  };
  const { errors, doc } = await finalize(spec, sub, { mode: 'standalone', resolveFile, specSha256, specFile });
  if (errors.length) {
    for (const w of written) fs.rmSync(w, { force: true });
    die(`${file} does not match this form`, { errors });
  }
  guardAnswered(dir, flags.force);
  writeJsonAtomic(answersPath, doc);
  emit({ event: 'submitted', answers: answersPath, summary: doc.summary });
}

// Build the next round from what the owner skipped or left blank. A skipped parent comes
// back with its follow-ups (they were hidden because the parent had no answer); a question
// whose parent was answered comes back without its showIf, since it already applies.
function cmdReask(target, flags) {
  const { dir, specPath } = resolveSpecPath(target);
  const { spec } = loadSpec(specPath);
  const answersPath = path.join(dir, 'answers.json');
  let doc;
  try { doc = JSON.parse(fs.readFileSync(answersPath, 'utf8')); } catch { die(`${answersPath} is missing or not valid JSON: serve this round first`); }
  if (doc.formId !== spec.id) die(`${answersPath} answers form "${doc.formId}", not "${spec.id}"`);
  const need = new Set(doc.summary?.needsAnswer ?? Object.entries(doc.answers || {})
    .filter(([, e]) => !e.optional && (e.status === 'skipped' || e.status === 'unanswered')).map(([id]) => id));
  if (!need.size) {
    emit({ event: 'complete', answers: answersPath, message: 'every required question is answered; nothing to re-ask' });
    return;
  }
  const round = (spec.round ?? 1) + 1;
  const included = new Set();
  for (const q of allQuestions(spec)) {
    // a question that still needs an answer, or a follow-up of one (transitively)
    if (need.has(q.id) || (q.showIf && included.has(q.showIf.question))) included.add(q.id);
  }
  const prev = (q) => {
    const e = doc.answers?.[q.id];
    if (!e || !need.has(q.id)) return null;
    const lines = [e.status === 'skipped' ? `**Round ${round - 1}: you skipped this.**` : `**Round ${round - 1}: this was left blank.**`];
    if (typeof e.reason === 'string') lines.push(`Your reason: “${e.reason}”`);
    if (typeof e.note === 'string') lines.push(`Your note: “${e.note}”`);
    return lines.join(' ');
  };
  const sections = spec.sections.map((sec) => ({
    ...sec,
    questions: sec.questions.filter((q) => included.has(q.id)).map((q) => {
      const out = { ...q };
      if (out.showIf && !included.has(out.showIf.question)) delete out.showIf;
      const p = prev(q);
      if (p) out.context = out.context ? `> ${p}\n\n${out.context}` : `> ${p}`;
      return out;
    }),
  })).filter((sec) => sec.questions.length);
  const id = /-r\d+$/.test(spec.id) ? spec.id.replace(/-r\d+$/, `-r${round}`) : `${spec.id}-r${round}`.slice(0, 120);
  const next = {
    ...spec,
    id,
    round,
    summary: `**Round ${round}.** ${need.size} question${need.size === 1 ? '' : 's'} from round ${round - 1} still need${need.size === 1 ? 's' : ''} your answer. Skipping doesn't hand a decision to the agent, so the grill isn't finished until these are answered.`,
    sections,
  };
  delete next.proven;
  const { errors } = validateSpec(next);
  if (errors.length) die('the re-ask form came out invalid (report this)', { errors });
  const out = path.resolve(typeof flags.out === 'string' ? flags.out : path.join(path.dirname(dir), `round-${round}`));
  const outSpec = path.join(out, 'questions.json');
  if (fs.existsSync(outSpec) && !flags.force) die(`${outSpec} already exists; edit it, or pass --force to regenerate it`);
  fs.mkdirSync(out, { recursive: true });
  writeJsonAtomic(outSpec, next);
  emit({ event: 'reask', dir: out, questions: included.size, needsAnswer: [...need], round });
}

const USAGE = `usage:
  node decision_form.mjs validate <form-dir | questions.json>
  node decision_form.mjs serve    <form-dir> [--port N] [--no-open] [--timeout-min 240] [--force]
  node decision_form.mjs wait     <form-dir> [--timeout-sec 540]
  node decision_form.mjs build    <form-dir | questions.json> [--out file.html] [--open]
  node decision_form.mjs import   <form-dir> <downloaded-answers.json> [--force] [--accept-changed-spec]
  node decision_form.mjs reask    <round-dir> [--out <next-round-dir>] [--force]`;

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [cmd, ...rest] = process.argv.slice(2);
  const { pos, flags } = parseArgs(rest);
  const run = {
    validate: () => cmdValidate(pos[0]),
    serve: () => cmdServe(pos[0], flags),
    wait: () => cmdWait(pos[0], flags),
    build: () => cmdBuild(pos[0], flags),
    import: () => cmdImport(pos[0], pos[1], flags),
    reask: () => cmdReask(pos[0], flags),
  }[cmd];
  if (!run) {
    process.stderr.write(`${USAGE}\n`);
    process.exit(cmd === undefined || cmd === '--help' || cmd === '-h' ? 0 : 1);
  }
  Promise.resolve().then(run).catch((e) => die(e.message));
}
