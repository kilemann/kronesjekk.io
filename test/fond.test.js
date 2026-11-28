'use strict';
/* Fond-fanen: tolking av lagrede kurser, perioder, avkastning, kurve og visning */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, flush, plain, nb, makeFetch } = require('./load');

const NOW = Date.UTC(2026, 10, 28, 12, 0, 0); // lørdag 28. nov. 2026
const LISTE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fond.json'), 'utf8'));
/* Samme testdata som Python-testene, gjort om slik innhenteren lagrer dem */
const MS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'morningstar.json'), 'utf8'));
const KURSER = MS.TimeSeries.Security[0].HistoryDetail.map(d => [d.EndDate, Number(d.Value)]);
const FIL = { id: 'dnb-global-indeks-a', navn: 'DNB Global Indeks A', isin: 'NO0010582984', kilde: 'Morningstar',
  oppdatert: new Date(NOW - 3 * 3600e3).toISOString(), kurser: KURSER };

const app = (opts = {}) => load({ now: NOW, ...opts }).api;

test('fond.json: fondslista appen og roboten deler', () => {
  assert.equal(LISTE.fond[0].navn, 'DNB Global Indeks A');
  assert.equal(LISTE.fond[0].isin, 'NO0010582984');
});

test('lesFond: sorterer, fjerner ugyldige og doble datoer, og krever kursliste', () => {
  const { lesFond } = app();
  const f = lesFond({ navn: 'X', kurser: [['2026-11-03', 3], ['2026-11-01', 1], ['2026-11-01', 1.5], ['tull', 9], ['2026-11-02', -1], ['2026-11-04', 'x'], 'feil'] });
  assert.deepEqual(plain(f.kurser), [['2026-11-01', 1.5], ['2026-11-03', 3]]);
  assert.throws(() => lesFond({}), /mangler kurser/);
  assert.throws(() => lesFond(null), /mangler kurser/);
});

test('trekkMnd: samme dag måneder tilbake, og siste dag i kortere måneder', () => {
  const { trekkMnd } = app();
  assert.equal(trekkMnd('2026-11-24', 1), '2026-10-24');
  assert.equal(trekkMnd('2026-11-24', 12), '2025-11-24');
  assert.equal(trekkMnd('2026-03-31', 1), '2026-02-28');
  assert.equal(trekkMnd('2024-03-31', 1), '2024-02-29', 'skuddår');
  assert.equal(trekkMnd('2026-01-15', 1), '2025-12-15', 'over nyttår');
  assert.equal(trekkMnd('2026-11-24', 60), '2021-11-24');
});

test('periodeStart og avkastning: siste kurs på eller før startdatoen', () => {
  const { periodeStart, avkastning } = app();
  const k = [['2026-09-30', 90], ['2026-10-23', 100], ['2026-10-26', 104], ['2026-11-24', 110]];
  assert.equal(periodeStart(k, 1), 1, '24. okt. er lørdag → bruker fredag 23. okt.');
  const a = avkastning(k, 1);
  assert.deepEqual(plain(a.fra), ['2026-10-23', 100]);
  assert.deepEqual(plain(a.til), ['2026-11-24', 110]);
  assert.ok(Math.abs(a.pst - 10) < 1e-9);
  assert.equal(avkastning(k, 12), null, 'historikken er for kort for 1 år');
  assert.ok(Math.abs(avkastning(k, null).pst - (110 / 90 - 1) * 100) < 1e-9, 'maks: fra første kurs');
  assert.equal(avkastning([], 1), null);
  assert.equal(avkastning([['2026-11-24', 1]], null), null, 'ett punkt gir ingen avkastning');
});

test('pstTekst: fortegn, ekte minus og desimaler', () => {
  const { pstTekst } = app();
  assert.equal(nb(pstTekst(12.345)), '+12,3 %');
  assert.equal(nb(pstTekst(-3.21)), '−3,2 %');
  assert.equal(nb(pstTekst(0)), '0,0 %');
  assert.equal(nb(pstTekst(181.4)), '+181 %');
  assert.equal(pstTekst(null), '–');
});

test('tynn og kurveSvg: høyst 360 punkter, første og siste med, og ufarlig tittel', () => {
  const { tynn, kurveSvg } = app();
  const t = tynn(KURSER);
  assert.equal(t.length, 360);
  assert.deepEqual(plain(t[0]), KURSER[0]);
  assert.deepEqual(plain(t[359]), KURSER[KURSER.length - 1]);
  assert.equal(tynn(KURSER.slice(0, 10)).length, 10);
  const svg = kurveSvg(KURSER.slice(-30), 'A <b>"x"</b>');
  assert.match(svg, /^<svg viewBox="0 0 600 200"/);
  assert.match(svg, /aria-label="A &lt;b&gt;&quot;x&quot;&lt;\/b&gt;"/);
  const linje = /<path class="linje" d="([^"]+)"/.exec(svg)[1];
  assert.equal(linje.split(/[ML]/).filter(Boolean).length, 30, '30 punkter i linja');
  assert.match(linje, /^M0\.0 /);
  assert.match(linje, /L600\.0 [\d.]+$/);
  for (const n of svg.match(/-?\d+\.\d/g)) assert.ok(Number(n) >= 0 && Number(n) <= 600, 'alt innenfor tegneflaten');
  assert.equal(kurveSvg([['2026-11-24', 1]]), '');
  assert.match(kurveSvg([['2026-11-23', 5], ['2026-11-24', 5]]), /<path class="linje"/, 'flat kurve deler ikke på null');
});

/* ---------- visning i fanen ---------- */
function bootFond(routes, storage = {}) {
  const log = [];
  const r = load({ now: NOW, storage: { 'kronekikk-fane': 'fond', ...storage }, fetch: makeFetch(routes, log) });
  return { ...r, log, panel: () => r.env.el('panel-fond').innerHTML };
}
const ok = { 'fond.json': { json: LISTE }, 'data/fond/dnb-global-indeks-a.json': { json: FIL } };

test('Fond-fanen: siste kurs, endring fra forrige, dato og alle seks perioder', async () => {
  const r = bootFond(ok); await flush(); await flush(); await flush();
  const h = nb(r.panel());
  assert.ok(r.log.includes('fond.json'));
  assert.ok(r.log.includes('data/fond/dnb-global-indeks-a.json'));
  assert.match(h, /<h3>DNB Global Indeks A<\/h3>/);
  assert.match(h, /NO0010582984/);
  assert.match(h, /841,50 kr/);
  assert.match(h, /chg pos">▲ 0,39 % <span class="small">\(\+3,30\)<\/span>/, '838,20 → 841,50');
  assert.match(h, /24\. nov\. 2026/);
  const knapper = [...h.matchAll(/data-p="(\w+)" aria-pressed="(\w+)"><span>([^<]+)<\/span><b class="(\w*)">([^<]+)</g)];
  assert.deepEqual(knapper.map(m => m[3]), ['1 mnd', '6 mnd', '1 år', '3 år', '5 år', 'Maks']);
  assert.deepEqual(knapper.map(m => m[2]), ['false', 'false', 'true', 'false', 'false', 'false'], '1 år er standard');
  for (const m of knapper) assert.match(m[5], /^[+−]?\d[\d ]*(,\d)? %$/, `${m[3]} har avkastning`);
  // forventet 1 år regnet direkte fra testdataene
  const til = KURSER[KURSER.length - 1], fra = KURSER.filter(k => k[0] <= '2025-11-24').pop();
  const forv = (til[1] / fra[1] - 1) * 100;
  assert.equal(knapper[2][5], `${forv > 0 ? '+' : '−'}${Math.abs(forv).toFixed(1).replace('.', ',')} %`);
  assert.match(h, /<figure class="kurve (pos|neg)"><svg/);
  assert.match(h, new RegExp(`${fra[0].slice(8, 10).replace(/^0/, '')}\\. nov\\. 2025: `), 'kurven starter ved 1-årsdatoen');
  assert.match(h, /Kurser fra Morningstar/);
  assert.match(h, /sist for 3 t siden/);
  assert.doesNotMatch(h, /Kilden kan ha sluttet/);
});

test('Fond-fanen: klikk på periode bytter kurve og huskes til neste gang', async () => {
  const r = bootFond(ok); await flush(); await flush(); await flush();
  const panel = r.env.el('panel-fond');
  panel.dispatch('click', { target: { closest: () => ({ dataset: { p: '5a' } }) } });
  assert.match(panel.innerHTML, /data-p="5a" aria-pressed="true"/);
  assert.match(panel.innerHTML, /data-p="1a" aria-pressed="false"/);
  assert.equal(r.env.storage.get('kronekikk-fondperiode'), '5a');
  assert.match(nb(panel.innerHTML), /For kort historikk til å vise 5 år|<figure class="kurve/);
  panel.dispatch('click', { target: { closest: () => ({ dataset: { p: 'tull' } }) } });
  assert.equal(r.env.storage.get('kronekikk-fondperiode'), '5a', 'ukjent periode ignoreres');
  panel.dispatch('click', { target: { closest: () => null } });
  const r2 = bootFond(ok, { 'kronekikk-fondperiode': '1m' }); await flush(); await flush(); await flush();
  assert.match(r2.panel(), /data-p="1m" aria-pressed="true"/, 'husket periode');
});

test('Fond-fanen: historikk kortere enn perioden gir melding i stedet for kurve', async () => {
  const kort = { ...FIL, kurser: KURSER.slice(-300) };
  const r = bootFond({ ...ok, 'data/fond/dnb-global-indeks-a.json': { json: kort } }, { 'kronekikk-fondperiode': '5a' });
  await flush(); await flush(); await flush();
  const h = nb(r.panel());
  assert.match(h, /For kort historikk til å vise 5 år\./);
  assert.match(h, /data-p="5a" aria-pressed="true"><span>5 år<\/span><b class="">–</);
  assert.doesNotMatch(h, /<figure/);
});

test('Fond-fanen: gamle kurser gir advarsel', async () => {
  const gammel = { ...FIL, kurser: KURSER.filter(k => k[0] <= '2026-11-10') };
  const r = bootFond({ ...ok, 'data/fond/dnb-global-indeks-a.json': { json: gammel } });
  await flush(); await flush(); await flush();
  assert.match(nb(r.panel()), /Siste kurs er fra 10\. nov\. 2026\. Kilden kan ha sluttet å svare\./);
});

test('Fond-fanen: fond uten data ennå, manglende liste og tom liste', async () => {
  const a = bootFond({ 'fond.json': { json: LISTE }, 'data/fond/': { ok: false, status: 404, json: {} } });
  await flush(); await flush(); await flush();
  assert.match(a.panel(), /<h3>DNB Global Indeks A<\/h3>/);
  assert.match(a.panel(), /Ingen kurser ennå\. Roboten henter dem automatisk/);
  const b = bootFond({ 'fond.json': { ok: false, status: 404, json: {} } });
  await flush(); await flush();
  assert.match(b.panel(), /sub err">Fant ikke fondslista \(fond\.json\)/);
  const c = bootFond({ 'fond.json': { json: { fond: [] } } });
  await flush(); await flush();
  assert.match(c.panel(), /Ingen fond i lista ennå/);
});

test('Fond-fanen: navn fra fila gjøres ufarlig', async () => {
  const r = bootFond({ ...ok, 'data/fond/dnb-global-indeks-a.json': { json: { ...FIL, navn: '<img src=x onerror=alert(1)>' } } });
  await flush(); await flush(); await flush();
  assert.doesNotMatch(r.panel(), /<img/);
  assert.match(r.panel(), /&lt;img src=x/);
});
