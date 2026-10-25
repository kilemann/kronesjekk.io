# Kronekikk v1.3.1

Valutakurser (EUR, USD, DKK, SEK) og ukens kundeaviser fra REMA 1000, Extra, Europris og Rusta.

Nettside: https://kilemannen.github.io/kronesjekk.io/

## Filer

| Fil | Hva |
|---|---|
| `index.html` | Selve appen. Lista `MODULER` øverst i skriptet styrer hva som vises. |
| `data/valuta.json` | Reservekopi av kursene (brukes hvis Norges Bank ikke svarer direkte). |
| `scripts/innhent.py` | Henter valutakurser og skriver til `data/`. |
| `.github/workflows/innhent.yml` | Kjører innhenteren på hverdager etter kl. 16. |

## Valuta
Hentes direkte fra Norges Banks åpne API (ingen nøkkel). DKK og SEK oppgis per 100, slik Norges Bank gjør.

## Butikk
Kjedens felles ukeavis for REMA 1000, Extra, Europris og Rusta.
Hver har kjedens egen kundeavis-side og siden på eTilbudsavis. For Extra er eTilbudsavis hovedlenken, fordi Coop sin side krever valg av kjede og postnummer.
Avisene ligger hos kjedene og vises ikke inne i appen (eTilbudsavis' API er bare for betalende kunder).

Ny kjede: legg en linje i `butikker` under `type: "butikk"` i `MODULER`.

## Legge til nye ting
Legg en ny blokk i `MODULER` i `index.html`. Typen `json` viser en enkel liste fra en fil i `data/`:

```json
{ "oppdatert": "2026-10-25T14:00:00+01:00",
  "rader": [ { "navn": "Strøm NO2", "verdi": "0,84 kr/kWh", "info": "snitt i dag" } ] }
```

## Versjoner
- 1.3.1 – REMA 1000 lenker til rema.no/kampanjer; Extra åpner eTilbudsavis direkte
- 1.3.0 – Nytt navn: Kronekikk (tidligere Kronesjekk)
- 1.2.1 – Rusta viser kjedens felles kundeavis
- 1.2.0 – REMA 1000 og Extra viser kjedens felles kundeavis
- 1.1.0 – Drivstoff fjernet, ny rubrikk Butikk med ukens kundeaviser
- 1.0.0 – Første versjon
