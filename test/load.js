'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { loadApp } = require('./harness');

const HTML = path.join(__dirname, '..', 'index.html');
const NAMES = [
  'MODULER', 'TYPER', 'IKONER', 'NAVN', 'esc', 'kr', 'siden', 'datoTekst', 'hentJson', 'lesNorgesBank', 'ukeInfo',
  'faner', 'vis', 'last', 'aktiv', 'lesLagret', 'skrivLagret', 'LAGRE',
];
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'norgesbank.json'), 'utf8'));
const EXPECTED = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'norgesbank.expected.json'), 'utf8'));

function load(opts = {}) { return loadApp(HTML, NAMES, opts); }
const flush = () => new Promise(r => setImmediate(r));
async function settle(p, env, step = 100, max = 500) {
  let done = false;
  p.then(() => { done = true; }, () => { done = true; });
  for (let i = 0; i < max && !done; i++) { await flush(); env.advance(step); }
  await flush();
  return p;
}
const plain = x => JSON.parse(JSON.stringify(x));
const nb = s => String(s).replace(/[  ]/g, ' ');

/* Simulert nett: svarer per URL-del. handlers = { norgesbank: fn|obj, valuta: fn|obj } */
function makeFetch(routes = {}, log = []) {
  return async (url, init) => {
    log.push(url);
    for (const [key, h] of Object.entries(routes)) {
      if (url.includes(key)) {
        const r = typeof h === 'function' ? await h(url, init) : h;
        if (r instanceof Error) throw r;
        return { ok: r.ok !== false, status: r.status || 200, json: async () => r.json };
      }
    }
    throw new TypeError('ingen rute for ' + url);
  };
}
module.exports = { load, flush, settle, plain, nb, makeFetch, FIXTURE, EXPECTED, HTML };
