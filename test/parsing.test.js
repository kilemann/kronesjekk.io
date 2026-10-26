'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain, nb, FIXTURE, EXPECTED, makeFetch, settle } = require('./load');

const { api, env } = load({ fetch: makeFetch({ norges: { json: FIXTURE }, valuta: { json: { kurser: {} } } }) });

test('lesNorgesBank: leser siste og forrige kurs, enhet (per 1 eller 100) og dato', () => {
  assert.deepEqual(plain(api.lesNorgesBank(FIXTURE)), EXPECTED);
});

test('lesNorgesBank: tåler svar uten «data»-omslag', () => {
  assert.deepEqual(plain(api.lesNorgesBank(FIXTURE.data)), EXPECTED);
});

test('lesNorgesBank: bruker UNIT_MULT også når den ikke er første attributt', () => {
  const r = plain(api.lesNorgesBank(FIXTURE));
  assert.equal(r.DKK.enhet, 100);
  assert.equal(r.EUR.enhet, 1);
});

test('lesNorgesBank: hopper over tomme og manglende observasjoner, og serier uten data', () => {
  const js = JSON.parse(JSON.stringify(FIXTURE));
  js.data.dataSets[0].series['0:1:0:0'].observations = { '0': [''], '1': [null] };
  const r = plain(api.lesNorgesBank(js));
  assert.equal(r.USD, undefined, 'USD uten gyldige tall er utelatt');
  assert.equal(r.EUR.kurs, 11.7);
});

test('lesNorgesBank: bare én observasjon gir forrige = null', () => {
  const js = JSON.parse(JSON.stringify(FIXTURE));
  js.data.dataSets[0].series['0:0:0:0'].observations = { '1': ['11.7'] };
  assert.equal(plain(api.lesNorgesBank(js)).EUR.forrige, null);
});

test('lesNorgesBank: observasjoner i feil rekkefølge sorteres etter dato', () => {
  const js = JSON.parse(JSON.stringify(FIXTURE));
  js.data.dataSets[0].series['0:0:0:0'].observations = { '1': ['11.7'], '0': ['11.6'] };
  const r = plain(api.lesNorgesBank(js)).EUR;
  assert.equal(r.kurs, 11.7); assert.equal(r.forrige, 11.6);
});

test('lesNorgesBank: uten UNIT_MULT-attributt regnes alt som per 1', () => {
  const js = JSON.parse(JSON.stringify(FIXTURE));
  delete js.data.structure.attributes;
  for (const s of Object.values(js.data.dataSets[0].series)) delete s.attributes;
  const r = plain(api.lesNorgesBank(js));
  assert.ok(Object.values(r).every(v => v.enhet === 1));
});

test('esc: gjør farlige tegn ufarlige og tåler tomme verdier', () => {
  assert.equal(api.esc('<img src=x onerror="alert(1)">&'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;');
  assert.equal(api.esc(null), '');
  assert.equal(api.esc(undefined), '');
  assert.equal(api.esc(0), '0');
});

test('kr: norsk tallformat med komma, og «–» for manglende', () => {
  assert.equal(nb(api.kr(11.7, 4)), '11,7000');
  assert.equal(nb(api.kr(157.23, 2)), '157,23');
  assert.equal(nb(api.kr(1234.5)), '1 234,50');
  assert.equal(api.kr(null), '–');
  assert.equal(api.kr(undefined), '–');
  assert.equal(nb(api.kr(0.8621)), '0,86');
});

test('siden: «nå nettopp», minutter, timer, i går og dager', () => {
  const nå = env.now();
  const iso = minAgo => new Date(nå - minAgo * 60000).toISOString();
  assert.equal(api.siden(''), '');
  assert.equal(api.siden(null), '');
  assert.equal(api.siden(iso(0)), 'nå nettopp');
  assert.equal(api.siden(iso(1)), 'nå nettopp');
  assert.equal(api.siden(iso(2)), 'for 2 min siden');
  assert.equal(api.siden(iso(59)), 'for 59 min siden');
  assert.equal(api.siden(iso(60)), 'for 1 t siden');
  assert.equal(api.siden(iso(23 * 60)), 'for 23 t siden');
  assert.equal(api.siden(iso(24 * 60)), 'i går');
  assert.equal(api.siden(iso(3 * 24 * 60)), 'for 3 dager siden');
});

test('datoTekst: ukedag, dag og måned på norsk', () => {
  assert.equal(api.datoTekst('2026-10-26'), 'mandag 26. oktober');
  assert.equal(api.datoTekst('2026-12-24'), 'torsdag 24. desember');
});

test('ukeInfo: ISO-ukenummer og periode mandag–søndag', () => {
  const u = d => plain(api.ukeInfo(d));
  assert.deepEqual(u(new Date(2026, 9, 26)), { uke: 44, periode: '26. okt. – 1. nov.' });
  assert.equal(u(new Date(2026, 10, 1)).uke, 44, 'søndag hører til samme uke');
  assert.equal(u(new Date(2026, 10, 2)).uke, 45);
  assert.equal(u(new Date(2026, 0, 1)).uke, 1);
  assert.equal(u(new Date(2020, 11, 31)).uke, 53);
  assert.equal(u(new Date(2021, 0, 3)).uke, 53);
  assert.equal(u(new Date(2021, 0, 4)).uke, 1);
  assert.equal(u(new Date(2024, 11, 30)).uke, 1);
  assert.equal(u(new Date(2026, 11, 28)).uke, 53, '2026 har 53 uker');
  assert.equal(u(new Date(2026, 11, 28)).periode, '28. des. – 3. jan.');
});

test('hentJson: ok svar, HTTP-feil og tidsavbrudd etter 12 sekunder', async () => {
  const a = load({ fetch: makeFetch({ 'x.json': { json: { a: 1 } }, 'feil.json': { ok: false, status: 500, json: {} } }) });
  assert.deepEqual(plain(await a.api.hentJson('x.json')), { a: 1 });
  await assert.rejects(a.api.hentJson('feil.json'), /HTTP 500/);
  const b = load({ fetch: (url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('avbrutt'), { name: 'AbortError' })))) });
  await assert.rejects(settle(b.api.hentJson('treg.json'), b.env, 1000), e => e.name === 'AbortError');
});

test('Modulene er gyldige: unike id-er, kjent type og kjent ikon', () => {
  const ids = new Set();
  for (const m of api.MODULER) {
    assert.ok(m.id && !/\s/.test(m.id), `ugyldig id: ${m.id}`);
    assert.ok(!ids.has(m.id), `dobbel id: ${m.id}`); ids.add(m.id);
    assert.equal(typeof api.TYPER[m.type], 'function', `${m.id}: ukjent type ${m.type}`);
    assert.ok(api.IKONER[m.ikon], `${m.id}: ukjent ikon ${m.ikon}`);
    assert.ok(m.tittel);
  }
});

test('Butikklenker: alle er https, og hver kjede har en kundeavis-lenke', () => {
  const b = api.MODULER.find(m => m.type === 'butikk');
  assert.ok(b.butikker.length >= 4);
  for (const k of b.butikker) {
    assert.ok(k.navn);
    for (const f of ['avis', 'etilbud', 'alt']) if (k[f]) assert.match(k[f], /^https:\/\//, `${k.navn}.${f}`);
    assert.ok(k.avis, `${k.navn} mangler avis-lenke`);
  }
  assert.deepEqual(plain(b.butikker.map(k => k.navn)), ['REMA 1000', 'Extra', 'Europris', 'Rusta']);
});
