# Kronekikk v1.5.0

Valutakurser (EUR, USD, DKK, SEK) og ukens kundeaviser fra REMA 1000, Extra, Europris og Rusta.

Nettside: https://kilemann.github.io/kronesjekk.io/

## Filer

| Fil | Hva |
|---|---|
| `index.html` | Selve appen. Lista `MODULER` øverst i skriptet styrer hvilke faner som vises. |
| `data/valuta.json` | Reservekopi av kursene (brukes hvis Norges Bank ikke svarer direkte). |
| `scripts/innhent.py` | Henter valutakurser og skriver til `data/`. |
| `.github/workflows/innhent.yml` | Kjører innhenteren på hverdager etter kl. 16. |

## Faner
Hver blokk i `MODULER` blir en egen fane. Fanelinja ligger nederst på mobil og øverst på PC.
Hver fane har sin egen adresse, f.eks. `…/kronesjekk.io/#butikk`, så du kan lage snarvei rett til den.
Appen husker sist brukte fane, og laster data først når fanen åpnes.

## Valuta
Hentes direkte fra Norges Banks åpne API (ingen nøkkel). DKK og SEK oppgis per 100, slik Norges Bank gjør.

## Butikk
Kjedens felles ukeavis for REMA 1000, Extra, Europris og Rusta.
Hver har kjedens egen kundeavis-side og siden på eTilbudsavis. For Extra er eTilbudsavis hovedlenken, fordi Coop sin side krever valg av kjede og postnummer.
Avisene ligger hos kjedene og vises ikke inne i appen (eTilbudsavis' API er bare for betalende kunder).

Ny kjede: legg en linje i `butikker` under `type: "butikk"` i `MODULER`.

## Legge til nye ting
Legg en ny blokk i `MODULER` i `index.html`, med `id` (brukes i adressen) og `ikon` (`valuta`, `butikk`, `liste`, `strom` eller `stjerne`). Den blir en ny fane. Typen `json` viser en enkel liste fra en fil i `data/`:

```json
{ "oppdatert": "2026-10-25T14:00:00+01:00",
  "rader": [ { "navn": "Strøm NO2", "verdi": "0,84 kr/kWh", "info": "snitt i dag" } ] }
```

## Tester
Appen er utviklet med test først (TDD) fra og med 1.5.0. JavaScript-testene kjører appens eget skript i en simulert nettleser med simulert nett og klokke. Python-testene dekker innhenteren. Begge bruker samme testdata fra Norges Bank (`test/fixtures/`), så appen og innhenteren tolker svaret likt.

```
npm test
```

Krever Node 22 eller nyere og Python 3. Ingen avhengigheter.

| Fil | Hva den tester |
|---|---|
| `test/parsing.test.js` | Norges Bank-tolking, tallformat, «for N min siden», ukenummer, modullista |
| `test/app.test.js` | Valuta med reserve og feilmeldinger, butikk, generell liste, faner, adresse, oppdater-knapp |
| `test/test_innhent.py` | Innhenteren: tolking, skriving av `data/valuta.json`, og at arbeidsflyten henger sammen |
| `test/release.test.js` | Versjonsnummer og endringslogg er like overalt |

Ved ny versjon: skriv testen først, endre så appen, og oppdater versjon i `package.json`, kommentaren øverst i `index.html`, bunnteksten og lista under.

## Versjoner
- 1.5.0 – Ingen endringer i hvordan appen virker. Automatiske tester lagt til.
- 1.4.0 – Faner: én fane per modul, egen adresse per fane, husker sist brukte fane
- 1.3.1 – REMA 1000 lenker til rema.no/kampanjer; Extra åpner eTilbudsavis direkte
- 1.3.0 – Nytt navn: Kronekikk (tidligere Kronesjekk)
- 1.2.1 – Rusta viser kjedens felles kundeavis
- 1.2.0 – REMA 1000 og Extra viser kjedens felles kundeavis
- 1.1.0 – Drivstoff fjernet, ny rubrikk Butikk med ukens kundeaviser
- 1.0.0 – Første versjon
