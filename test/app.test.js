'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, flush, settle, plain, nb, makeFetch, FIXTURE } = require('./load');

const NOW = Date.UTC(2026, 9, 26, 12, 0, 0);
const okNet = (log = []) => makeFetch({ 'data.norges-bank.no': { json: FIXTURE }, 'data/valuta.json': { json: { kurser: {} } } }, log);
// som i en ekte nettleser: hash leses alltid tilbake med # foran
function fakeLocation(hash = '') {
  return { protocol: 'https:', href: 'https://example.test/', _h: hash,
    get hash() { return this._h; }, set hash(v) { this._h = v ? (String(v).startsWith('#') ? String(v) : '#' + v) : ''; } };
}
function boot(opts = {}) {
  const location = opts.location || fakeLocation();
  const log = [];
  const r = load({ now: NOW, location, fetch: opts.fetch || okNet(log), storage: opts.storage, storageFails: opts.storageFails });
  return { ...r, location, log };
}
const hashTo = (r, id) => { r.location.hash = '#' + id; r.env.winEvents.dispatch('hashchange'); };

test('Valuta: henter fra Norges Bank og viser fire valutaer med kurs og endring', async () => {
  const r = boot(); await flush(); await flush();
  const html = r.env.el('panel-valuta').innerHTML;
  assert.match(r.log[0], /data\.norges-bank\.no\/api\/data\/EXR\/B\.EUR\+USD\+DKK\+SEK\.NOK\.SP\?format=sdmx-json&lastNObservations=2/);
  for (const k of ['EUR', 'USD', 'DKK', 'SEK']) assert.match(html, new RegExp(`class="code">${k}<`));
  assert.match(nb(html), /11,7000 kr/);
  assert.match(nb(html), /10,1000 kr/);
  assert.match(nb(html), /157,23 kr/, 'DKK vises med to desimaler, per 100');
  assert.match(html, /per 100 DKK/);
  assert.match(html, /per 1 EUR/);
  assert.match(html, /chg up">▲ 0,86 %/, 'EUR steg fra 11,60 til 11,70');
  assert.match(html, /chg down">▼ 0,98 %/, 'USD falt fra 10,20 til 10,10');
  assert.match(html, /chg ">• 0,00 %/, 'DKK uendret');
  assert.match(html, /Norges Banks midtkurs mandag 26\. oktober\./);
  assert.doesNotMatch(html, /Viser sist lagrede/);
});

test('Valuta: SEK uten kurs siste dag bruker siste gyldige og viser ingen endring', async () => {
  const r = boot(); await flush(); await flush();
  const html = r.env.el('panel-valuta').innerHTML;
  assert.match(nb(html), /104,50 kr/);
  const sek = html.slice(html.indexOf('>SEK<'));
  assert.doesNotMatch(sek, /class="chg/, 'ingen forrige kurs → ingen endringsmerke');
});

test('Valuta: faller tilbake til lagret fil når Norges Bank ikke svarer, og sier fra', async () => {
  const lagret = { kurser: { EUR: { kurs: 11.5, enhet: 1, dato: '2026-10-22', forrige: 11.4 } } };
  const r = boot({ fetch: makeFetch({ 'data.norges-bank.no': new TypeError('nett'), 'data/valuta.json': { json: lagret } }) });
  await flush(); await flush(); await flush();
  const html = r.env.el('panel-valuta').innerHTML;
  assert.match(nb(html), /11,5000 kr/);
  assert.match(html, /Viser sist lagrede kurser \(Norges Bank svarte ikke direkte\)/);
  assert.doesNotMatch(html, /class="code">USD/, 'valutaer uten data hoppes over');
});

test('Valuta: feilmelding når både Norges Bank og lagret fil mangler', async () => {
  const r = boot({ fetch: makeFetch({ 'data.norges-bank.no': new TypeError('nett'), 'data/valuta.json': { ok: false, status: 404, json: {} } }) });
  await flush(); await flush(); await flush();
  assert.match(r.env.el('panel-valuta').innerHTML, /Fikk ikke hentet kurser fra Norges Bank\. Prøv igjen litt senere\./);
  assert.match(r.env.el('panel-valuta').innerHTML, /sub err/);
});

test('Valuta: tom lagret fil regnes som mangel, ikke som tom liste', async () => {
  const r = boot({ fetch: makeFetch({ 'data.norges-bank.no': new TypeError('nett'), 'data/valuta.json': { json: { kurser: {} } } }) });
  await flush(); await flush(); await flush();
  assert.match(r.env.el('panel-valuta').innerHTML, /Fikk ikke hentet kurser/);
});

test('Butikk: fire kjeder med ukens avis, uke og periode, og trygge lenker', async () => {
  const r = boot({ storage: { 'kronekikk-fane': 'butikk' } }); await flush();
  const html = r.env.el('panel-butikk').innerHTML;
  assert.match(html, /Uke 44<\/span> · 26\. okt\. – 1\. nov\./);
  for (const navn of ['REMA 1000', 'Extra', 'Europris', 'Rusta']) assert.match(html, new RegExp(`<h3>${navn}</h3>`));
  assert.equal((html.match(/Ukens kundeavis ↗/g) || []).length, 4);
  assert.equal((html.match(/<a class="alt"[^>]*>eller på eTilbudsavis<\/a>/g) || []).length, 3, 'Extra har eTilbudsavis som hovedlenke');
  assert.match(html, /eller hos Coop \(velg Extra \+ postnummer\)/);
  assert.equal((html.match(/target="_blank" rel="noopener"/g) || []).length, 4 + 3 + 1);
  assert.match(html, /href="https:\/\/www\.rema\.no\/kampanjer\/"/);
  assert.match(html, /href="https:\/\/etilbudsavis\.no\/Extra"/);
});

test('Generell liste (json-type): viser rader, og gjør innholdet ufarlig', async () => {
  const r = boot();
  const el = r.env.document.createElement('section');
  const fil = { oppdatert: new Date(NOW - 5 * 60000).toISOString(), rader: [{ navn: 'Strøm <b>NO2</b>', verdi: '0,84 kr/kWh', info: 'snitt "i dag"' }, { navn: 'Tom', verdi: '1' }] };
  const r2 = load({ now: NOW, fetch: makeFetch({ 'data/strom.json': { json: fil } }) });
  await r2.api.TYPER.json(el, { tittel: 'Strømpris', fil: 'data/strom.json' });
  assert.match(el.innerHTML, /Oppdatert for 5 min siden/);
  assert.match(el.innerHTML, /Strøm &lt;b&gt;NO2&lt;\/b&gt;/);
  assert.match(el.innerHTML, /snitt &quot;i dag&quot;/);
  assert.doesNotMatch(el.innerHTML, /<b>NO2/);
  assert.match(el.innerHTML, /0,84 kr\/kWh/);
  const r3 = load({ now: NOW, fetch: makeFetch({ 'data/mangler.json': { ok: false, status: 404, json: {} } }) });
  const el2 = r3.env.document.createElement('section');
  await r3.api.TYPER.json(el2, { tittel: 'X', fil: 'data/mangler.json' });
  assert.match(el2.innerHTML, /Fant ikke data\/mangler\.json/);
});

/* ---------- Faner ---------- */
test('Faner: én knapp og ett panel per modul, første fane er åpen som standard', async () => {
  const r = boot(); await flush();
  assert.equal(r.api.faner.length, 2);
  assert.equal(r.api.faner[0].knapp.getAttribute('aria-selected'), 'true');
  assert.equal(r.api.faner[1].knapp.getAttribute('aria-selected'), 'false');
  assert.equal(r.api.faner[0].el.hidden, false);
  assert.equal(r.api.faner[1].el.hidden, true);
  assert.equal(r.api.faner[0].knapp.tabIndex, 0);
  assert.equal(r.api.faner[1].knapp.tabIndex, -1);
  assert.equal(r.env.document.title, 'Valuta – Kronekikk');
  assert.equal(r.env.storage.get('kronekikk-fane'), 'valuta');
  assert.equal(r.api.faner[0].knapp.getAttribute('role'), 'tab');
  assert.equal(r.api.faner[0].el.getAttribute('role'), 'tabpanel');
  assert.equal(r.api.faner[0].el.getAttribute('aria-labelledby'), 'fane-valuta');
  assert.match(r.api.faner[0].knapp.innerHTML, /<span>Valuta<\/span>/);
});

test('Faner: data lastes først når fanen åpnes, og bare én gang', async () => {
  const r = boot(); await flush(); await flush();
  assert.equal(r.api.faner[1].lastet, false, 'Butikk er ikke lastet ennå');
  assert.equal(r.env.el('panel-butikk').innerHTML, '');
  hashTo(r, 'butikk'); await flush();
  assert.equal(r.api.faner[1].lastet, true);
  assert.match(r.env.el('panel-butikk').innerHTML, /Ukens kundeaviser/);
  const nett = r.log.length;
  hashTo(r, 'valuta'); hashTo(r, 'butikk'); await flush();
  assert.equal(r.log.length, nett, 'ingen ny henting når fanen åpnes igjen');
});

test('Faner: bytte fane oppdaterer valgt, skjuling, tittel og husker valget', async () => {
  const r = boot(); await flush();
  hashTo(r, 'butikk'); await flush();
  assert.equal(r.api.faner[1].knapp.getAttribute('aria-selected'), 'true');
  assert.equal(r.api.faner[0].el.hidden, true);
  assert.equal(r.api.faner[1].el.hidden, false);
  assert.equal(r.env.document.title, 'Butikk – Kronekikk');
  assert.equal(r.env.storage.get('kronekikk-fane'), 'butikk');
});

test('Faner: adresse (#butikk) vinner over lagret fane, og ukjent adresse gir første fane', async () => {
  const a = boot({ location: fakeLocation('#butikk'), storage: { 'kronekikk-fane': 'valuta' } }); await flush();
  assert.equal(a.api.aktiv.id, 'butikk');
  const b = boot({ storage: { 'kronekikk-fane': 'butikk' } }); await flush();
  assert.equal(b.api.aktiv.id, 'butikk', 'sist brukte fane huskes');
  const c = boot({ location: fakeLocation('#finnesikke') }); await flush();
  assert.equal(c.api.aktiv.id, 'valuta');
  const d = boot({ storage: { 'kronekikk-fane': 'slettet-fane' } }); await flush();
  assert.equal(d.api.aktiv.id, 'valuta', 'lagret fane som ikke finnes lenger');
});

test('Faner: klikk på fanen setter adressen, og klikk på åpen fane laster ingenting på nytt', async () => {
  const r = boot(); await flush(); await flush();
  r.api.faner[1].knapp.click();
  assert.equal(r.location.hash, '#butikk');
  const nett = r.log.length;
  r.api.faner[0].knapp.click();
  assert.equal(r.location.hash, '#valuta');
  r.env.winEvents.dispatch('hashchange'); await flush();
  r.api.faner[0].knapp.click(); // samme hash som før: vis() kalles direkte
  assert.equal(r.log.length, nett);
});

test('Faner: piltaster går til neste og forrige fane, med rundgang', async () => {
  const r = boot(); await flush();
  const key = k => r.env.el('tabs').dispatch('keydown', { key: k });
  key('ArrowRight'); assert.equal(r.location.hash, '#butikk'); r.env.winEvents.dispatch('hashchange');
  key('ArrowRight'); assert.equal(r.location.hash, '#valuta', 'fra siste til første');
  r.env.winEvents.dispatch('hashchange');
  key('ArrowLeft'); assert.equal(r.location.hash, '#butikk', 'fra første til siste');
  r.location.hash = 'uendret'; key('Enter'); assert.equal(r.location.hash, '#uendret', 'andre taster gjør ingenting');
});

test('Oppdater-knappen laster bare åpen fane på nytt og snurrer mens den jobber', async () => {
  const r = boot(); await flush(); await flush();
  const før = r.log.length;
  r.env.el('refresh').click();
  assert.ok(r.env.el('refresh').classList.contains('spin'));
  assert.equal(r.env.el('refresh').disabled, true);
  await flush(); await flush();
  assert.equal(r.log.length, før + 1, 'ny henting av valuta');
  assert.equal(r.env.el('refresh').classList.contains('spin'), false);
  assert.equal(r.env.el('refresh').disabled, false);
  hashTo(r, 'butikk'); await flush();
  const etter = r.log.length;
  r.env.el('refresh').click(); await flush();
  assert.equal(r.log.length, etter, 'Butikk har ingen nettkall, og valuta røres ikke');
});

test('Appen starter selv om lagring er blokkert', async () => {
  const r = boot({ storageFails: true }); await flush(); await flush();
  assert.equal(r.api.aktiv.id, 'valuta');
  assert.match(r.env.el('panel-valuta').innerHTML, /EUR/);
});
