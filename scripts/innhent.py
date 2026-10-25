#!/usr/bin/env python3
"""Kronekikk innhenter v1.2.0

Kjøres av GitHub Actions (se .github/workflows/innhent.yml) og skriver
ferske tall til data/-mappa, som appen leser.

  data/valuta.json - valutakurser fra Norges Bank (åpent API, ingen nøkkel)

Nye jobber legges i JOBBER nederst; hver skriver sin egen fil i data/.

Versjoner
  1.2.0  Nytt navn: Kronekikk
  1.1.0  Drivstoff fjernet
  1.0.0  Første versjon: Norges Bank-valuta, Google Places-drivstoff (valgfri)
"""
import json, os, sys, urllib.request, urllib.error
from datetime import datetime, timezone

ROT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROT, "data")
NA = lambda: datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def hent_json(url, headers=None, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": "kronekikk/1.2", **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def skriv(navn, obj):
    sti = os.path.join(DATA, navn)
    with open(sti, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("skrev", sti)


# ------------------------------------------------------------------ valuta
VALUTAER = ["EUR", "USD", "DKK", "SEK"]


def les_norges_bank(js):
    """Tolker SDMX-JSON fra Norges Bank. Returnerer {kode: {kurs, enhet, dato, forrige}}
    der kurs er NOK per 'enhet' utenlandske (f.eks. 100 SEK)."""
    rot = js.get("data", js)
    struktur = rot["structure"]
    ds = rot["dataSets"][0]
    dims = struktur["dimensions"]["series"]
    datoer = [v["id"] for v in struktur["dimensions"]["observation"][0]["values"]]
    attr = struktur.get("attributes", {}).get("series", [])
    i_cur = next(i for i, d in enumerate(dims) if d["id"] == "BASE_CUR")
    i_mult = next((i for i, a in enumerate(attr) if a["id"] == "UNIT_MULT"), None)
    ut = {}
    for nokkel, serie in ds["series"].items():
        deler = [int(x) for x in nokkel.split(":")]
        kode = dims[i_cur]["values"][deler[i_cur]]["id"]
        mult = 0
        if i_mult is not None and serie.get("attributes"):
            idx = serie["attributes"][i_mult]
            if idx is not None:
                mult = int(attr[i_mult]["values"][idx]["id"])
        obs = sorted(((int(k), float(v[0])) for k, v in serie["observations"].items() if v and v[0] not in (None, "")))
        if not obs:
            continue
        siste = obs[-1]
        forrige = obs[-2][1] if len(obs) > 1 else None
        ut[kode] = {"kurs": siste[1], "enhet": 10 ** mult, "dato": datoer[siste[0]], "forrige": forrige}
    return ut


def valuta():
    url = ("https://data.norges-bank.no/api/data/EXR/B." + "+".join(VALUTAER) +
           ".NOK.SP?format=sdmx-json&lastNObservations=2&locale=no")
    kurser = les_norges_bank(hent_json(url))
    skriv("valuta.json", {"oppdatert": NA(), "kilde": "Norges Bank", "kurser": kurser})


if __name__ == "__main__":
    JOBBER = [valuta]  # legg til nye jobber her
    feil = 0
    for jobb in JOBBER:
        try:
            jobb()
        except Exception as e:  # én kilde som feiler skal ikke stoppe de andre
            print(jobb.__name__, "feilet:", e, file=sys.stderr)
            feil += 1
    sys.exit(1 if feil == len(JOBBER) else 0)
