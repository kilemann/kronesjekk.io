# Kronekikk (repo kronesjekk.io)
Valutakurser fra Norges Bank (EUR, USD, DKK, SEK) og ukens kundeaviser (REMA 1000, Extra, Europris, Rusta). Én HTML-fil (`index.html`).
Nettside: https://kilemann.github.io/kronesjekk.io/

## Regler for alt arbeid i dette repoet
- Svar brukeren på norsk. Commit-meldinger på norsk, med versjon først (f.eks. «Appnavn 1.4.0: kort beskrivelse»).
- Hver endring får nytt versjonsnummer (MAJOR.MINOR.PATCH) og en linje i endringsloggen. Versjonen skal være lik på alle stedene under.
- Lever rett på `main` når resultatet er godt nok og testene er grønne. Kjør `git fetch origin main` og rebase før push.
- Testdrevet utvikling (TDD) bare når brukeren ber om det. Eksisterende tester kjøres alltid før push.
- Tekniske påstander skal sjekkes mot dokumentasjon eller kilde, ikke gjettes.
- Appen står på samlesida (kilemann.github.io). Den skal vise navn, versjon og en (i)-knapp øverst til venstre. (i) åpner info-vinduet med bruksanvisning og versjonsliste. Oppdater versjonslista der ved hver ny versjon.
- Publiseres med GitHub Pages fra `main` (rot). Det tar noen minutter før endringen er ute.

## Versjon står her
- `package.json`
- `index.html`: kommentaren øverst i `<style>` (`/* Kronekikk vX.Y.Z` + changelog-linje), `<span class="ai-ver">` i overskriften, bunnteksten `<span>Kronekikk vX.Y.Z</span>`, versjonslista i info-vinduet
- `README.md`: tittel og «Versjoner»
- `scripts/innhent.py` har egen versjon. Endres bare når skriptet endres

## Tester
`npm test` kjører både JavaScript-testene (Node 22) og Python-testene (`test/test_innhent.py`). Begge bruker samme testdata fra Norges Bank i `test/fixtures/`.

## Viktig
- En robot (`.github/workflows/innhent.yml`) skriver `data/valuta.json` til `main` hver hverdag. Hent alltid siste `main` før push, og ikke endre `data/` for hånd.
