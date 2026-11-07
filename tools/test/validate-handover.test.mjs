import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { validaHandover, validaFileHandover } from '../validate-handover.mjs';
const payload = () => ({ schema_version: '2.1', task_id: 'TASK-025', dispatch_id: 'DISP-025-A', outcome: 'COMPLETO', base_sha: 'abc', head_sha: 'def', acceptance_criteria: [{ id: 'AC-1', status: 'PASSED', evidence: 'ok' }], checks: [{ command: 'node --test', exit_code: 0, details: 'ok' }], invariants: [{ name: 'test', preserved: true }], findings: [{ id: 'F-1', severity: 'P3', description: 'test' }], decisions: ['none'] });
test('accetta payload completo e versione 2.0', () => { assert.deepEqual(validaHandover(payload()), { valido: true, errori: [] }); assert.equal(validaHandover({ ...payload(), schema_version: '2.0' }).valido, true); });
test('rifiuta campi mancanti e valori non conformi', () => {
 const cases = [[p => delete p.dispatch_id, 'dispatch_id'], [p => p.schema_version = '3.0', 'schema_version'], [p => p.schema_version = 2.1, 'schema_version'], [p => p.task_id = 'task-025', 'task_id'], [p => p.outcome = 'OK', 'outcome'], [p => p.base_sha = 123, 'base_sha'], [p => p.head_sha = null, 'head_sha'], [p => p.acceptance_criteria = {}, 'acceptance_criteria'], [p => p.acceptance_criteria[0].status = 'OK', 'status'], [p => p.acceptance_criteria[0].evidence = 2, 'evidence'], [p => delete p.acceptance_criteria[0].id, 'id'], [p => p.checks[0].exit_code = 0.5, 'exit_code'], [p => delete p.checks[0].details, 'details'], [p => p.checks[0].command = 1, 'command'], [p => p.invariants[0].preserved = 'yes', 'preserved'], [p => p.findings[0].severity = 'P4', 'severity'], [p => p.decisions = [1], 'decisions']];
 for (const [mutate, field] of cases) { const p = payload(); mutate(p); const result = validaHandover(p); assert.equal(result.valido, false, field); assert.ok(result.errori.some(e => e.includes(field)), `${field}: ${result.errori}`); }
 assert.equal(validaHandover([]).valido, false);
});
test('valida file e CLI', () => { const dir = mkdtempSync(join(tmpdir(), 'handover-')); try { const valid = join(dir, 'valid.json'); const invalid = join(dir, 'invalid.json'); writeFileSync(valid, JSON.stringify(payload())); writeFileSync(invalid, '{'); assert.equal(validaFileHandover(valid).valido, true); assert.equal(validaFileHandover(invalid).valido, false); assert.equal(validaFileHandover(join(dir, 'missing')).valido, false); const ok = spawnSync(process.execPath, ['tools/validate-handover.mjs', valid], { encoding: 'utf8' }); const bad = spawnSync(process.execPath, ['tools/validate-handover.mjs', invalid], { encoding: 'utf8' }); assert.equal(ok.status, 0); assert.match(ok.stdout, /conforme/i); assert.equal(bad.status, 1); assert.match(bad.stderr, /NON valido/); } finally { rmSync(dir, { recursive: true, force: true }); } });
