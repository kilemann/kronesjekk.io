'use strict';
/* Utgivelsesregler: versjonen skal være lik overalt, og endringsloggen skal starte med gjeldende versjon. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const V = pkg.version, esc = V.replace(/\./g, '\\.');

test('Versjon i stilkommentaren, bunnteksten og README-tittelen er lik package.json', () => {
  assert.match(html, new RegExp(`/\\* Kronekikk v${esc}\\n`), 'kommentaren øverst i index.html');
  assert.match(html, new RegExp(`<span>Kronekikk v${esc}</span>`), 'bunnteksten');
  assert.match(readme, new RegExp(`^# Kronekikk v${esc}\\n`), 'README-tittelen');
});

test('Endringsloggen i index.html starter med gjeldende versjon og er sortert nyeste først', () => {
  const list = [...html.matchAll(/\n\s{3}(\d+)\.(\d+)\.(\d+)\s{2}\S/g)].map(m => m.slice(1).map(Number));
  assert.ok(list.length >= 8, 'for få versjoner funnet i loggen');
  assert.equal(list[0].join('.'), V);
  for (let i = 1; i < list.length; i++) {
    const [a, b] = [list[i - 1], list[i]];
    const nyere = a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2])));
    assert.ok(nyere, `rekkefølgen er feil: ${a.join('.')} før ${b.join('.')}`);
  }
});

test('README har versjonsliste med gjeldende versjon øverst', () => {
  const m = /## Versjoner\s+- (\d+\.\d+\.\d+)/.exec(readme);
  assert.ok(m, 'README mangler «## Versjoner»');
  assert.equal(m[1], V);
});
