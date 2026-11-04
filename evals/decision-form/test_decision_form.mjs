#!/usr/bin/env node
// Regression tests for skills/grill/scripts/decision_form.mjs (and its synced copy in
// implement). Node 18+, standard library only:
//
//   node --test evals/decision-form/test_decision_form.mjs
//
// Drives the real CLI: validates specs, serves a form and talks to it over HTTP the way
// the page does (token, uploads, submit), checks every exit path the agent waits on,
// builds an offline copy, imports a download.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(ROOT, 'skills', 'grill', 'scripts', 'decision_form.mjs');
const PAGE = path.join(ROOT, 'skills', 'grill', 'assets', 'decision-form', 'index.html');
const EXAMPLE = path.join(ROOT, 'skills', 'grill', 'assets', 'decision-form', 'example.questions.json');
const { validateSpec, finalize } = await import(SCRIPT);

const example = () => JSON.parse(fs.readFileSync(EXAMPLE, 'utf8'));
const tmpDirs = [];
process.on('exit', () => { for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true }); });

function formDir(spec = example()) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-form-test-'));
  tmpDirs.push(dir);
  fs.writeFileSync(path.join(dir, 'questions.json'), JSON.stringify(spec, null, 2));
  return dir;
}

function cli(...args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  const events = r.stdout.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { code: r.status, events, stderr: r.stderr };
}

function request(port, { method = 'GET', path: p = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* not json */ }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
    req.end();
  });
}

function serve(dir, ...extra) {
  const args = extra.includes('--port') || extra.includes('--preferred-port') ? extra.filter((a) => a !== '--preferred-port') : ['--port', '0', ...extra];
  const child = spawn(process.execPath, [SCRIPT, 'serve', dir, '--no-open', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  const events = [];
  let buf = '';
  const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  const ready = new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const ev = JSON.parse(buf.slice(0, i));
        buf = buf.slice(i + 1);
        events.push(ev);
        if (ev.event === 'ready') resolve(ev);
        if (ev.event === 'error') reject(new Error(ev.message));
      }
    });
    child.on('exit', () => reject(new Error(`server exited before ready: ${JSON.stringify(events)}`)));
  });
  ready.catch(() => {});
  return { child, events, exited, ready };
}

const blankSubmission = (spec) => {
  const answers = {};
  for (const q of spec.sections.flatMap((s) => s.questions)) answers[q.id] = { status: 'unanswered' };
  return { formId: spec.id, answers };
};

const inlineScriptHash = (html) => `'sha256-${crypto.createHash('sha256').update(html.match(/<script>([\s\S]*?)<\/script>/)[1]).digest('base64')}'`;

// ---------------------------------------------------------------- validation

test('the shipped example is valid with no warnings', () => {
  const { errors, warnings } = validateSpec(example());
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});

test('validate rejects the mistakes agents actually make', () => {
  const spec = example();
  const qs = spec.sections[0].questions;
  qs[0].recommendation.value = 'not-an-option';
  qs[1].id = qs[0].id;
  qs[2].type = 'checkbox';
  qs[3].showIf = { question: 'later-question', in: ['x'] };
  delete spec.sections[3].questions[0].recommendation;
  spec.sections[1].questions[0].recommendation.reason = '';
  const { errors } = validateSpec(spec);
  const has = (frag) => assert.ok(errors.some((e) => e.includes(frag)), `expected an error containing "${frag}" in:\n${errors.join('\n')}`);
  has('recommendation.value: must be one of the option ids');
  has('duplicate question id');
  has('type: must be one of');
  has('is not a question earlier in the form');
  has('confirm questions need');
  has('recommendation.reason: required');
});

test('validate rejects recommendations that one click would make unsubmittable', () => {
  const spec = example();
  const cols = spec.sections[0].questions[2];
  cols.recommendation.value = ['tax', 'tax'];
  let { errors } = validateSpec(spec);
  assert.ok(errors.some((e) => e.includes('accepting it would be rejected') && e.includes('distinct')), errors.join('\n'));

  const s2 = example();
  s2.sections[0].questions[2].min = 3; // recommendation picks 2
  ({ errors } = validateSpec(s2));
  assert.ok(errors.some((e) => e.includes('pick at least 3')), errors.join('\n'));

  const s3 = example();
  s3.sections[1].questions[0].recommendation.value = 500; // below min 1000
  ({ errors } = validateSpec(s3));
  assert.ok(errors.some((e) => e.includes('must be >= 1000')), errors.join('\n'));
});

test('validate warns on typos and on missing recommendations', () => {
  const spec = example();
  spec.sections[0].questions[1].opitons = [];
  delete spec.sections[0].questions[1].recommendation;
  const { errors, warnings } = validateSpec(spec);
  assert.deepEqual(errors, []);
  assert.ok(warnings.some((w) => w.includes('opitons: unknown field')));
  assert.ok(warnings.some((w) => w.includes('offer a recommendation')));
});

test('validate CLI exits 1 with the problems listed', () => {
  const dir = formDir({ version: 1, id: 'x', title: 'X', sections: [] });
  const r = cli('validate', dir);
  assert.equal(r.code, 1);
  assert.equal(r.events[0].event, 'error');
  assert.match(r.events[0].errors.join('\n'), /sections: required non-empty array/);
});

test('numeric flags are validated instead of misbehaving', () => {
  const dir = formDir();
  for (const args of [['--timeout-min', 'abc'], ['--timeout-min', '0'], ['--timeout-min', '100000'], ['--port'], ['--port', '70000']]) {
    const r = cli('serve', dir, '--no-open', ...args);
    assert.equal(r.code, 1, `${args.join(' ')} should be refused`);
    assert.equal(r.events.at(-1).event, 'error');
    assert.match(r.events.at(-1).message, /must be/);
  }
  assert.ok(!fs.existsSync(path.join(dir, 'form-session.json')), 'a refused serve leaves no session behind');
  const w = cli('wait', dir, '--timeout-sec', 'abc');
  assert.equal(w.code, 1);
});

// ---------------------------------------------------------------- finalize

test('finalize derives display, acceptance, visibility and summary itself', async () => {
  const spec = example();
  const sub = blankSubmission(spec);
  sub.answers['soft-deleted'] = { status: 'answered', value: 'exclude', note: 'finance agreed' };
  sub.answers['date-boundary'] = { status: 'answered', value: 'tenant' };
  sub.answers.columns = { status: 'answered', value: ['tax'], other: 'Due date' };
  sub.answers['notes-visibility'] = { status: 'not_applicable' };
  sub.answers.encoding = { status: 'answered', value: 'semicolons please' };
  sub.answers.filename = { status: 'skipped', reason: 'you pick' };
  const { errors, doc } = await finalize(spec, sub, { mode: 'served', resolveFile: async () => { throw new Error('no files'); } });
  assert.deepEqual(errors, []);
  const a = doc.answers;
  assert.equal(a['soft-deleted'].display, 'Leave them out');
  assert.equal(a['soft-deleted'].acceptedRecommendation, false);
  assert.equal(a['soft-deleted'].recommended, 'include');
  assert.equal(a['soft-deleted'].note, 'finance agreed');
  assert.equal(a['date-boundary'].acceptedRecommendation, true);
  assert.equal(a.columns.display, 'Tax breakdown; Other: Due date');
  assert.equal(a['notes-visibility'].status, 'not_applicable');
  assert.equal(a.encoding.acceptedRecommendation, false);
  assert.equal(a.filename.reason, 'you pick');
  assert.equal(doc.summary.answered, 4);
  assert.equal(doc.summary.skipped, 1);
  assert.equal(doc.summary.notApplicable, 1);
  assert.equal(doc.summary.optionalLeftBlank, 2);
  assert.deepEqual(doc.summary.overrodeRecommendations.sort(), ['columns', 'encoding', 'soft-deleted']);
  assert.deepEqual(doc.summary.withNotes, ['soft-deleted']);
});

test('finalize refuses to drop an answered follow-up whose parent is not answered', async () => {
  // The page used to show the follow-up while its parent was invalid (other ticked, empty);
  // the server then rewrote the owner's one-way-door answer to not_applicable.
  const spec = example();
  const sub = blankSubmission(spec);
  sub.answers.columns = { status: 'unanswered' };
  sub.answers['notes-visibility'] = { status: 'answered', value: 'everyone' };
  const r = await finalize(spec, sub, { mode: 'served' });
  assert.ok(r.errors.some((e) => e.includes('notes-visibility') && e.includes('only applies when columns')), r.errors.join('\n'));
});

test('finalize flags a skipped one-way door and rejects malformed values', async () => {
  const spec = example();
  const sub = blankSubmission(spec);
  sub.answers.columns = { status: 'answered', value: ['notes'] };
  sub.answers['notes-visibility'] = { status: 'skipped' };
  let r = await finalize(spec, sub, { mode: 'served' });
  assert.deepEqual(r.doc.summary.oneWayDoorsNotAnswered, ['notes-visibility']);

  sub.answers['max-rows'] = { status: 'answered', value: 5 };
  sub.answers.priorities = { status: 'answered', value: ['speed'] };
  sub.answers.bogus = { status: 'answered', value: 1 };
  r = await finalize(spec, sub, { mode: 'served' });
  assert.ok(r.errors.some((e) => e.includes('answers.bogus: not a question')));
  delete sub.answers.bogus;
  r = await finalize(spec, sub, { mode: 'served' });
  assert.ok(r.errors.some((e) => e.includes('max-rows: must be >= 1000')));
  assert.ok(r.errors.some((e) => e.includes('priorities: value must list every option id once')));
});

test('finalize treats a question id named like an Object method as missing, not as the method', async () => {
  const spec = { version: 1, id: 'proto', title: 'P', sections: [{ id: 's', title: 'S', questions: [{ id: 'constructor', type: 'text', title: 'T' }] }] };
  const r = await finalize(spec, { formId: 'proto', answers: {} }, { mode: 'served' });
  assert.deepEqual(r.errors, []);
  assert.equal(r.doc.answers.constructor.status, 'unanswered');
});

// ---------------------------------------------------------------- serve

test('serve: guards, upload, bad submit, good submit, exit 0', async (t) => {
  const dir = formDir();
  const srv = serve(dir, '--timeout-min', '2');
  t.after(() => srv.child.kill('SIGKILL'));
  const ready = await srv.ready;
  const port = ready.port;
  const token = new URL(ready.url).searchParams.get('t');
  const auth = { 'x-form-token': token };
  const session = JSON.parse(fs.readFileSync(path.join(dir, 'form-session.json'), 'utf8'));
  assert.equal(session.pid, srv.child.pid);
  assert.equal(fs.statSync(path.join(dir, 'form-session.json')).mode & 0o077, 0, 'session file (holds the token) is private');

  const page = await request(port);
  assert.equal(page.status, 200);
  const csp = page.headers['content-security-policy'];
  assert.match(csp, /default-src 'none'/);
  assert.ok(csp.includes(`script-src ${inlineScriptHash(page.text)}`), 'CSP pins the page script by hash, no unsafe-inline');
  assert.ok(!/script-src[^;]*unsafe-inline/.test(csp));

  assert.equal((await request(port, { path: '/api/spec' })).status, 403, 'no token');
  assert.equal((await request(port, { path: '/api/spec', headers: { 'x-form-token': 'x'.repeat(token.length) } })).status, 403, 'same-length wrong token');
  assert.equal((await request(port, { path: '/api/spec', headers: { ...auth, host: `evil.test:${port}` } })).status, 403, 'DNS-rebinding host');
  assert.equal((await request(port, { path: '/api/spec', headers: { ...auth, origin: 'https://evil.test' } })).status, 403, 'foreign origin');
  assert.equal((await request(port, { path: '/api/spec', headers: { ...auth, origin: 'null' } })).status, 403, 'opaque origin');
  assert.equal((await request(port, { method: 'POST', path: '/api/submit', body: '{}' })).status, 403, 'submit needs the token');
  const specRes = await request(port, { path: '/api/spec', headers: auth });
  assert.equal(specRes.status, 200);
  assert.equal(specRes.json.spec.id, 'invoice-csv-export-grill-r1');
  assert.deepEqual(specRes.json.uploads, []);

  const up = (name, body, q = 'sample-file') => request(port, {
    method: 'POST', path: `/api/upload?q=${q}&name=${encodeURIComponent(name)}`, headers: { ...auth, 'content-type': 'text/csv' }, body,
  });
  assert.equal((await up('x.csv', 'a', 'soft-deleted')).status, 400, 'not an upload question');
  const kept = await up('../../../etc/passwd (copy).csv', 'a,b\n1,2\n');
  assert.equal(kept.status, 200);
  assert.equal(kept.json.path, 'uploads/sample-file/passwd (copy).csv', 'path traversal is stripped');
  assert.equal(kept.json.sha256, crypto.createHash('sha256').update('a,b\n1,2\n').digest('hex'));
  const dropped = await up('removed.csv', 'zzz');
  const big = await up('big.csv', Buffer.alloc(11 * 1048576));
  assert.equal(big.status, 413, 'maxSizeMB is enforced, with a readable response');
  assert.match(big.json.error, /over 10 MB/);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'uploads', 'sample-file')).sort(), ['passwd (copy).csv', 'removed.csv'], 'no partial file left');

  const sub = blankSubmission(specRes.json.spec);
  sub.answers['sample-file'] = { status: 'answered', value: [{ name: 'forged', path: '../questions.json' }] };
  const bad = await request(port, { method: 'POST', path: '/api/submit', headers: { ...auth, 'content-type': 'application/json' }, body: sub });
  assert.equal(bad.status, 400);
  assert.match(bad.json.errors.join('\n'), /not on the server any more/);

  sub.answers['sample-file'] = { status: 'answered', value: [{ name: kept.json.name, path: kept.json.path }] };
  sub.answers['soft-deleted'] = { status: 'answered', value: 'include' };
  sub.answeredBy = 'Owner';
  const good = await request(port, { method: 'POST', path: '/api/submit', headers: { ...auth, 'content-type': 'application/json' }, body: sub });
  assert.equal(good.status, 200, good.text);
  assert.equal(good.json.doc.answers['soft-deleted'].display, 'Include them, flagged', 'response carries the normalized doc');
  assert.equal(await srv.exited, 0);
  assert.equal(srv.events.at(-1).event, 'submitted');

  const doc = JSON.parse(fs.readFileSync(path.join(dir, 'answers.json'), 'utf8'));
  assert.equal(doc.mode, 'served');
  assert.equal(doc.answeredBy, 'Owner');
  assert.equal(doc.specSha256, crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'questions.json'))).digest('hex'));
  assert.equal(doc.answers['sample-file'].value[0].sha256.length, 64);
  assert.ok(fs.existsSync(path.join(dir, kept.json.path)));
  assert.ok(!fs.existsSync(path.join(dir, dropped.json.path)), 'unreferenced uploads are cleaned up');
  assert.ok(!fs.existsSync(path.join(dir, 'form-session.json')), 'session file removed on exit');

  const again = cli('serve', dir, '--no-open');
  assert.equal(again.code, 1, 'a submitted round is not served again without --force');
  assert.match(again.events[0].message, /already exists/);
});

test('serve exit codes: timeout 3, SIGINT 130, SIGTERM 143, SIGHUP ignored', async () => {
  const t1 = serve(formDir(), '--timeout-min', '0.01');
  await t1.ready;
  assert.equal(await t1.exited, 3, 'a timeout must not look like a submit');
  assert.equal(t1.events.at(-1).event, 'timeout');

  for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
    const dir = formDir();
    const s = serve(dir);
    await s.ready;
    s.child.kill(sig);
    assert.equal(await s.exited, code, sig);
    assert.ok(!fs.existsSync(path.join(dir, 'form-session.json')), `${sig} removes the session file`);
  }

  const dir = formDir();
  const s = serve(dir);
  const ready = await s.ready;
  s.child.kill('SIGHUP');
  await new Promise((r) => setTimeout(r, 300));
  assert.equal((await request(ready.port, { path: '/' })).status, 200, 'still serving after SIGHUP');
  s.child.kill('SIGTERM');
  assert.equal(await s.exited, 143);
});

test('one server per form; a crashed server is detected and taken over', async (t) => {
  const dir = formDir();
  const a = serve(dir);
  t.after(() => a.child.kill('SIGKILL'));
  await a.ready;
  const b = cli('serve', dir, '--no-open', '--port', '0');
  assert.equal(b.code, 1);
  assert.match(b.events.at(-1).message, /already being served/);

  const w2 = cli('wait', dir, '--timeout-sec', '1');
  assert.equal(w2.code, 2, 'live server, nothing submitted yet: keep waiting');

  a.child.kill('SIGKILL'); // crash: the session file stays behind
  await a.exited;
  assert.ok(fs.existsSync(path.join(dir, 'form-session.json')));
  const t0 = Date.now();
  const w = cli('wait', dir, '--timeout-sec', '30');
  assert.equal(w.code, 3, 'a crashed server reads as not running');
  assert.ok(Date.now() - t0 < 8000);
  assert.match(w.events.at(-1).message, /gone/);

  const c = serve(dir);
  t.after(() => c.child.kill('SIGKILL'));
  await c.ready; // takes over the stale session
  c.child.kill('SIGTERM');
  assert.equal(await c.exited, 143);
});

test('serve --force moves the previous answers aside so wait cannot return them', async (t) => {
  const dir = formDir();
  fs.writeFileSync(path.join(dir, 'answers.json'), JSON.stringify({ summary: { answered: 99 } }));
  const s = serve(dir, '--force');
  t.after(() => s.child.kill('SIGKILL'));
  await s.ready;
  assert.ok(!fs.existsSync(path.join(dir, 'answers.json')));
  assert.equal(fs.readdirSync(dir).filter((f) => f.startsWith('answers.replaced-')).length, 1);
  const w = cli('wait', dir, '--timeout-sec', '1');
  assert.equal(w.code, 2);
  s.child.kill('SIGTERM');
  await s.exited;
});

test('serve falls back to a random port when the form-derived one is taken', async (t) => {
  const spec = example();
  const preferred = 41000 + (parseInt(crypto.createHash('sha256').update(spec.id).digest('hex').slice(0, 8), 16) % 8000);
  const blocker = net.createServer().listen(preferred, '127.0.0.1');
  await new Promise((r) => blocker.once('listening', r));
  t.after(() => blocker.close());
  const s = serve(formDir(spec), '--preferred-port');
  t.after(() => s.child.kill('SIGKILL'));
  const ready = await s.ready;
  assert.notEqual(ready.port, preferred);
  s.child.kill('SIGTERM');
  await s.exited;
});

test('serve refuses to write uploads through a symlinked folder', async (t) => {
  const dir = formDir();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-form-outside-'));
  tmpDirs.push(outside);
  fs.mkdirSync(path.join(dir, 'uploads'));
  fs.symlinkSync(outside, path.join(dir, 'uploads', 'sample-file'));
  const s = serve(dir);
  t.after(() => s.child.kill('SIGKILL'));
  const ready = await s.ready;
  const token = new URL(ready.url).searchParams.get('t');
  const r = await request(ready.port, { method: 'POST', path: '/api/upload?q=sample-file&name=x.csv', headers: { 'x-form-token': token }, body: 'a' });
  assert.equal(r.status, 500);
  assert.match(r.json.error, /symlink/);
  assert.deepEqual(fs.readdirSync(outside), []);
  s.child.kill('SIGTERM');
  await s.exited;
});

test('wait: exits 3 with no server, 0 once answers exist', () => {
  const dir = formDir();
  const t0 = Date.now();
  let r = cli('wait', dir, '--timeout-sec', '30');
  assert.equal(r.code, 3);
  assert.ok(Date.now() - t0 < 15000);
  r = cli('wait', dir, '--timeout-sec', '2');
  assert.equal(r.code, 3, 'a short timeout with no server still says "not running", not "waiting"');
  fs.writeFileSync(path.join(dir, 'answers.json'), JSON.stringify({ summary: { answered: 1 } }));
  r = cli('wait', dir, '--timeout-sec', '5');
  assert.equal(r.code, 0);
  assert.equal(r.events[0].event, 'submitted');
});

// ---------------------------------------------------------------- build + import

test('build inlines the spec safely, records its hash, and pins the script with a CSP', () => {
  const spec = example();
  spec.summary = 'Evil </script><script>alert(1)</script> <!-- and a $& replacement pattern';
  const dir = formDir(spec);
  const out = path.join(dir, 'offline=copy.html');
  const r = cli('build', dir, `--out=${out}`);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.events[0].html, out, '--out=value keeps everything after the first "="');
  const html = fs.readFileSync(out, 'utf8');
  const m = html.match(/<script id="form-spec" type="application\/json" data-sha256="([0-9a-f]{64})">([\s\S]*?)<\/script>/);
  assert.ok(m, 'spec tag with hash present');
  assert.equal(m[1], crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'questions.json'))).digest('hex'));
  assert.ok(!m[2].includes('<'), 'every < is escaped inside the tag');
  assert.deepEqual(JSON.parse(m[2]), spec, 'round-trips exactly, $& included');
  const page = fs.readFileSync(PAGE, 'utf8');
  assert.ok(html.includes(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${inlineScriptHash(page)};`));

  const d = cli('build', dir);
  assert.equal(d.code, 0);
  assert.equal(fs.statSync(d.events[0].html).mode & 0o077, 0, 'default output is private');
  assert.notEqual(path.dirname(d.events[0].html), os.tmpdir(), 'default output sits in its own fresh folder');
  tmpDirs.push(path.dirname(d.events[0].html));
});

function standaloneDownload(dir, spec, mutate = () => {}) {
  const sub = blankSubmission(spec);
  sub.answers['sample-file'] = { status: 'answered', value: [{ name: 'mock.csv', type: 'text/csv', size: 8, dataUrl: `data:text/csv;base64,${Buffer.from('a,b\n1,2\n').toString('base64')}` }] };
  sub.answers.priorities = { status: 'answered', value: ['speed', 'excel', 'correct-totals'] };
  sub.mode = 'standalone';
  sub.specSha256 = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'questions.json'))).digest('hex');
  mutate(sub);
  const file = path.join(dir, `download-${crypto.randomBytes(3).toString('hex')}.json`);
  fs.writeFileSync(file, JSON.stringify(sub));
  return file;
}

test('import turns a downloaded standalone file into answers.json', () => {
  const dir = formDir();
  const spec = example();
  const r = cli('import', dir, standaloneDownload(dir, spec));
  assert.equal(r.code, 0, r.stderr);
  const doc = JSON.parse(fs.readFileSync(path.join(dir, 'answers.json'), 'utf8'));
  assert.equal(doc.mode, 'standalone');
  assert.match(doc.specSha256, /^[0-9a-f]{64}$/);
  assert.equal(fs.readFileSync(path.join(dir, doc.answers['sample-file'].value[0].path), 'utf8'), 'a,b\n1,2\n');
  assert.equal(doc.answers.priorities.acceptedRecommendation, false);

  const r2 = cli('import', dir, standaloneDownload(dir, spec, (s) => { s.formId = 'other-form'; }), '--force');
  assert.equal(r2.code, 1);
  assert.match(r2.events[0].errors.join('\n'), /formId must be/);
});

test('import refuses answers to questions that changed after build', () => {
  const dir = formDir();
  const spec = example();
  const file = standaloneDownload(dir, spec);
  spec.sections[0].questions[0].title = 'Reworded after the owner saw it';
  fs.writeFileSync(path.join(dir, 'questions.json'), JSON.stringify(spec));
  const r = cli('import', dir, file);
  assert.equal(r.code, 1);
  assert.match(r.events.at(-1).message, /changed after the offline copy was built/);
  assert.ok(!fs.existsSync(path.join(dir, 'answers.json')));
  const ok = cli('import', dir, file, '--accept-changed-spec');
  assert.equal(ok.code, 0, ok.stderr);
});

test('import rejects bad uploads and leaves nothing behind', () => {
  const spec = example();
  const cases = [
    [(s) => { s.answers['sample-file'].value[0].dataUrl = 'not a data url'; }, /must carry a dataUrl/],
    [(s) => { s.answers['sample-file'].value[0].dataUrl = `data:text/csv;base64,${Buffer.alloc(11 * 1048576).toString('base64')}`; }, /over 10 MB/],
    [(s) => { s.answers['sample-file'].value[0].dataUrl = 'data:text/csv,%E0%A4%A'; }, /malformed dataUrl/],
  ];
  for (const [mutate, re] of cases) {
    const dir = formDir();
    const r = cli('import', dir, standaloneDownload(dir, spec, mutate));
    assert.equal(r.code, 1);
    assert.match(r.events.at(-1).errors.join('\n'), re);
    const up = path.join(dir, 'uploads', 'sample-file');
    assert.ok(!fs.existsSync(up) || !fs.readdirSync(up).length, 'no files left behind');
  }
  const dir = formDir();
  const r = cli('import', dir, standaloneDownload(dir, spec, (s) => { s.answers['sample-file'].value[0].name = '../../escape.csv'; }));
  assert.equal(r.code, 0, r.stderr);
  const doc = JSON.parse(fs.readFileSync(path.join(dir, 'answers.json'), 'utf8'));
  assert.equal(doc.answers['sample-file'].value[0].path, 'uploads/sample-file/escape.csv');
});

// ---------------------------------------------------------------- re-asking skipped questions

test('a skip is never complete: needsAnswer lists required skipped and blank questions', async () => {
  const spec = example();
  const sub = blankSubmission(spec);
  for (const q of spec.sections.flatMap((x) => x.questions)) if (q.recommendation && !q.showIf) sub.answers[q.id] = { status: 'answered', value: q.type === 'confirm' ? q.recommendation.value : q.recommendation.value };
  sub.answers['soft-deleted'] = { status: 'skipped', reason: 'ask finance' };
  sub.answers['max-rows'] = { status: 'unanswered' };
  const { errors, doc } = await finalize(spec, sub, { mode: 'served' });
  assert.deepEqual(errors, []);
  assert.deepEqual(doc.summary.needsAnswer, ['soft-deleted', 'max-rows'], 'optional blanks (sample-file, done-means) are not re-asked');
  assert.equal(doc.summary.complete, false);
  sub.answers['soft-deleted'] = { status: 'answered', value: 'include' };
  sub.answers['max-rows'] = { status: 'answered', value: 100000 };
  const r2 = await finalize(spec, sub, { mode: 'served' });
  assert.deepEqual(r2.doc.summary.needsAnswer, []);
  assert.equal(r2.doc.summary.complete, true);
});

test('reask builds the next round from exactly what still needs an answer', async () => {
  const spec = example();
  const dir = path.join(formDir(spec), 'round-1');
  fs.mkdirSync(dir);
  fs.renameSync(path.join(dir, '..', 'questions.json'), path.join(dir, 'questions.json'));
  const sub = blankSubmission(spec);
  sub.answers['soft-deleted'] = { status: 'answered', value: 'include' };
  sub.answers.columns = { status: 'skipped', reason: 'need to ask finance' }; // hides notes-visibility
  sub.answers.priorities = { status: 'skipped', note: 'depends on Q2' };
  const { doc } = await finalize(spec, sub, { mode: 'served' });
  fs.writeFileSync(path.join(dir, 'answers.json'), JSON.stringify(doc));

  const r = cli('reask', dir);
  assert.equal(r.code, 0, r.stderr);
  const next = JSON.parse(fs.readFileSync(path.join(dir, '..', 'round-2', 'questions.json'), 'utf8'));
  assert.equal(next.round, 2);
  assert.equal(next.id, 'invoice-csv-export-grill-r2');
  const ids = next.sections.flatMap((x) => x.questions.map((q) => q.id));
  assert.ok(!ids.includes('soft-deleted'), 'answered questions stay answered');
  assert.ok(ids.includes('columns') && ids.includes('notes-visibility'), 'a skipped parent comes back with the follow-up it hid');
  assert.ok(ids.includes('priorities') && ids.includes('filename'), 'skipped and blank required questions come back');
  assert.ok(!ids.includes('sample-file') && !ids.includes('done-means'), 'optional questions are not re-asked');
  const cols = next.sections.flatMap((x) => x.questions).find((q) => q.id === 'columns');
  assert.match(cols.context, /Round 1: you skipped this\.\*\* Your reason: “need to ask finance”/);
  const nv = next.sections.flatMap((x) => x.questions).find((q) => q.id === 'notes-visibility');
  assert.deepEqual(nv.showIf, { question: 'columns', in: ['notes'] }, 'the follow-up keeps its condition when its parent comes back too');
  assert.deepEqual(validateSpec(next).errors, []);
  assert.equal(cli('reask', dir).code, 1, 'an existing next round is not overwritten');
});

test('reask drops showIf from a follow-up whose parent was already answered', async () => {
  const spec = example();
  const dir = formDir(spec);
  const sub = blankSubmission(spec);
  for (const q of spec.sections.flatMap((x) => x.questions)) if (q.recommendation && !q.showIf) sub.answers[q.id] = { status: 'answered', value: q.recommendation.value };
  sub.answers.columns = { status: 'answered', value: ['notes'] };
  sub.answers['notes-visibility'] = { status: 'skipped' };
  const { doc } = await finalize(spec, sub, { mode: 'served' });
  assert.deepEqual(doc.summary.needsAnswer, ['notes-visibility']);
  fs.writeFileSync(path.join(dir, 'answers.json'), JSON.stringify(doc));
  const out = path.join(dir, 'next');
  assert.equal(cli('reask', dir, '--out', out).code, 0);
  const next = JSON.parse(fs.readFileSync(path.join(out, 'questions.json'), 'utf8'));
  const qs = next.sections.flatMap((x) => x.questions);
  assert.deepEqual(qs.map((q) => q.id), ['notes-visibility']);
  assert.equal(qs[0].showIf, undefined, 'it already applies; its parent is not in this round');
  assert.equal(qs[0].oneWayDoor, true);
});

test('reask on a complete round writes nothing', async () => {
  const spec = example();
  const dir = formDir(spec);
  const sub = blankSubmission(spec);
  for (const q of spec.sections.flatMap((x) => x.questions)) if (q.recommendation && !q.showIf) sub.answers[q.id] = { status: 'answered', value: q.recommendation.value };
  const { doc } = await finalize(spec, sub, { mode: 'served' });
  assert.equal(doc.summary.complete, true);
  fs.writeFileSync(path.join(dir, 'answers.json'), JSON.stringify(doc));
  const r = cli('reask', dir, '--out', path.join(dir, 'next'));
  assert.equal(r.code, 0);
  assert.equal(r.events[0].event, 'complete');
  assert.ok(!fs.existsSync(path.join(dir, 'next')));
});

test('implement ships an identical copy', (t) => {
  const r = spawnSync('python3', [path.join(ROOT, 'tools', 'sync_shared_scripts.py'), '--check'], { encoding: 'utf8' });
  if (r.error) return t.skip('python3 not available; run tools/sync_shared_scripts.py --check elsewhere');
  assert.equal(r.status, 0, r.stdout);
  return undefined;
});
