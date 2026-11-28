#!/usr/bin/env python3
"""Kronekikk innhenter v1.3.1

Kjøres av GitHub Actions (se .github/workflows/innhent.yml) og skriver
ferske tall til data/-mappa, som appen leser.

  data/valuta.json      - valutakurser fra Norges Bank (åpent API, ingen nøkkel)
  data/fond/<id>.json   - kurshistorikk per fond i fond.json, fra Morningstar
  data/fond-status.json - hvordan siste henting av hvert fond gikk

Nye jobber legges i JOBBER nederst; hver skriver sin egen fil i data/.

Versjoner
  1.3.1  Morningstar: ny vertsadresse lt.morningstar.com (tools.morningstar.* finnes ikke lenger)
  1.3.0  Fondskurser fra Morningstar (dagskurs, hele historikken) for fondene i fond.json
  1.2.0  Nytt navn: Kronekikk
  1.1.0  Drivstoff fjernet
  1.0.0  Første versjon: Norges Bank-valuta, Google Places-drivstoff (valgfri)
"""
import json, os, re, sys, urllib.request, urllib.error
from datetime import datetime, timezone

ROT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROT, "data")
NA = lambda: datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def hent_json(url, headers=None, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": "kronekikk/1.3", **(headers or {})})
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


# ------------------------------------------------------------------ fond
# Morningstar har ikke noe offisielt gratis API. Adressene under er de samme som
# Morningstar sine egne fondsider bruker, og kan endre seg uten varsel. Derfor
# prøves flere varianter i rekkefølge, og den som virket skrives i data/fond-status.json.
# Mønster: https://help.portfolio-performance.info/en/how-to/downloading-historical-prices/morningstar/
# Vertsadressen ble lt.morningstar.com i juli 2026:
# https://forum.portfolio-performance.info/t/morningstar-json-is-not-working/33630
MS_VARIANTER = [
    "https://lt.morningstar.com/api/rest.svc/timeseries_price/t92wz0sj7c?id={id}]2]0]FONOR$$ALL",
    "https://lt.morningstar.com/api/rest.svc/timeseries_price/t92wz0sj7c?id={id}]2]0]FOEUR$$ALL",
    "https://lt.morningstar.com/api/rest.svc/timeseries_price/t92wz0sj7c?id={id}]2]0]FOGBR$$ALL",
    "https://lt.morningstar.com/api/rest.svc/timeseries_price/t92wz0sj7c?id={id}",
]
MS_PARAMS = "&currencyId=NOK&idtype=Morningstar&frequency=daily&startDate=1990-01-01&outputType=JSON"
NETTLESER = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
MIN_PUNKTER = 20


def les_morningstar(js):
    """Tolker Morningstar timeseries_price. Godtar både JSON
    ({"TimeSeries": {"Security": [{"HistoryDetail": [{"EndDate", "Value"}]}]}}) og
    COMPACTJSON ([[millisekunder, verdi], ...]). Returnerer [[ "ÅÅÅÅ-MM-DD", kurs ], ...]
    sortert på dato, uten duplikater og uten ugyldige verdier."""
    rader = []
    if isinstance(js, dict):
        sec = (js.get("TimeSeries") or {}).get("Security") or []
        for d in (sec[0].get("HistoryDetail") or []) if sec else []:
            rader.append((str(d.get("EndDate", ""))[:10], d.get("Value")))
    elif isinstance(js, list):
        for p in js:
            if isinstance(p, (list, tuple)) and len(p) >= 2 and isinstance(p[0], (int, float)):
                dato = datetime.fromtimestamp(p[0] / 1000, timezone.utc).strftime("%Y-%m-%d")
                rader.append((dato, p[1]))
    ut = {}
    for dato, v in rader:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", dato):
            continue
        try:
            kurs = float(v)
        except (TypeError, ValueError):
            continue
        if kurs > 0:
            ut[dato] = round(kurs, 4)
    return [[d, ut[d]] for d in sorted(ut)]


def hent_fondskurser(ms_id):
    """Prøver variantene i MS_VARIANTER. Returnerer (kurser, variantnummer) for første
    som gir minst MIN_PUNKTER kurser, ellers RuntimeError med det som gikk galt."""
    feil = []
    for i, mal in enumerate(MS_VARIANTER, 1):
        url = mal.format(id=ms_id) + MS_PARAMS
        try:
            kurser = les_morningstar(hent_json(url, {"User-Agent": NETTLESER, "Accept": "application/json"}))
        except Exception as e:  # nettfeil, ikke-JSON (f.eks. HTML eller XML) osv.
            feil.append(f"variant {i}: {type(e).__name__}: {e}"[:200])
            continue
        if len(kurser) >= MIN_PUNKTER:
            return kurser, i
        feil.append(f"variant {i}: bare {len(kurser)} kurser")
    raise RuntimeError("; ".join(feil))


def les_fil(sti, standard=None):
    try:
        with open(sti, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return standard


def fond():
    liste = les_fil(os.path.join(ROT, "fond.json"), {}).get("fond", [])
    os.makedirs(os.path.join(DATA, "fond"), exist_ok=True)
    status = {"oppdatert": NA(), "kilde": "Morningstar", "fond": {}}
    feil = 0
    for f in liste:
        fid = f["id"]
        sti = os.path.join(DATA, "fond", fid + ".json")
        gammel = les_fil(sti, {}) or {}
        try:
            kurser, variant = hent_fondskurser(f["morningstar"])
            # vern: et svar som plutselig er mye kortere enn det vi har, skal ikke slette historikken
            if len(kurser) < len(gammel.get("kurser", [])) // 2:
                raise RuntimeError(f"svaret har {len(kurser)} kurser, lagret har {len(gammel['kurser'])}; beholder lagret")
            obj = {"id": fid, "navn": f["navn"], "isin": f.get("isin", ""), "valuta": "NOK",
                   "kilde": "Morningstar", "oppdatert": NA(), "kurser": kurser}
            with open(sti, "w", encoding="utf-8") as ut:
                json.dump(obj, ut, ensure_ascii=False, separators=(",", ":"))
                ut.write("\n")
            print("skrev", sti, len(kurser), "kurser, siste", kurser[-1])
            status["fond"][fid] = {"ok": True, "variant": variant, "antall": len(kurser),
                                   "forste": kurser[0], "siste": kurser[-1]}
        except Exception as e:
            feil += 1
            print("fond", fid, "feilet:", e, file=sys.stderr)
            status["fond"][fid] = {"ok": False, "feil": str(e)[:1000],
                                   "siste_lagrede": (gammel.get("kurser") or [None])[-1]}
    skriv("fond-status.json", status)
    if liste and feil == len(liste):
        raise RuntimeError("ingen fond kunne hentes")


if __name__ == "__main__":
    JOBBER = [valuta, fond]  # legg til nye jobber her
    feil = 0
    for jobb in JOBBER:
        try:
            jobb()
        except Exception as e:  # én kilde som feiler skal ikke stoppe de andre
            print(jobb.__name__, "feilet:", e, file=sys.stderr)
            feil += 1
    sys.exit(1 if feil == len(JOBBER) else 0)
