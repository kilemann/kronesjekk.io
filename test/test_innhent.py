"""Tester for scripts/innhent.py (Kronekikk innhenter).

Kjør alle: python3 -m unittest discover -s test -p "test_*.py" -v
Bruker samme testdata som JavaScript-testene, så appen og innhenteren tolker Norges Bank likt.
"""
import importlib.util
import json
import os
import tempfile
import unittest
from unittest import mock

HER = os.path.dirname(os.path.abspath(__file__))
ROT = os.path.dirname(HER)


def last_modul():
    spec = importlib.util.spec_from_file_location("innhent", os.path.join(ROT, "scripts", "innhent.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def les(navn):
    with open(os.path.join(HER, "fixtures", navn), encoding="utf-8") as f:
        return json.load(f)


innhent = last_modul()


class LesNorgesBank(unittest.TestCase):
    def test_tolker_samme_testdata_som_appen(self):
        self.assertEqual(innhent.les_norges_bank(les("norgesbank.json")), les("norgesbank.expected.json"))

    def test_tåler_svar_uten_data_omslag(self):
        self.assertEqual(innhent.les_norges_bank(les("norgesbank.json")["data"]), les("norgesbank.expected.json"))

    def test_hopper_over_serier_uten_gyldige_observasjoner(self):
        js = les("norgesbank.json")
        js["data"]["dataSets"][0]["series"]["0:1:0:0"]["observations"] = {"0": [""], "1": [None]}
        ut = innhent.les_norges_bank(js)
        self.assertNotIn("USD", ut)
        self.assertEqual(ut["EUR"]["kurs"], 11.7)

    def test_en_observasjon_gir_ingen_forrige(self):
        js = les("norgesbank.json")
        js["data"]["dataSets"][0]["series"]["0:0:0:0"]["observations"] = {"1": ["11.7"]}
        self.assertIsNone(innhent.les_norges_bank(js)["EUR"]["forrige"])

    def test_observasjoner_sorteres_etter_dato(self):
        js = les("norgesbank.json")
        js["data"]["dataSets"][0]["series"]["0:0:0:0"]["observations"] = {"1": ["11.7"], "0": ["11.6"]}
        ut = innhent.les_norges_bank(js)["EUR"]
        self.assertEqual((ut["kurs"], ut["forrige"]), (11.7, 11.6))

    def test_uten_unit_mult_er_enhet_1(self):
        js = les("norgesbank.json")
        del js["data"]["structure"]["attributes"]
        for s in js["data"]["dataSets"][0]["series"].values():
            s.pop("attributes", None)
        self.assertTrue(all(v["enhet"] == 1 for v in innhent.les_norges_bank(js).values()))


class Skriving(unittest.TestCase):
    def test_skriv_lager_gyldig_json_med_norske_tegn_og_linjeskift(self):
        with tempfile.TemporaryDirectory() as d, mock.patch.object(innhent, "DATA", d):
            innhent.skriv("test.json", {"navn": "Strøm æøå"})
            tekst = open(os.path.join(d, "test.json"), encoding="utf-8").read()
        self.assertIn("Strøm æøå", tekst, "tegn skal ikke skrives som \\u-koder")
        self.assertTrue(tekst.endswith("\n"))
        self.assertEqual(json.loads(tekst), {"navn": "Strøm æøå"})

    def test_valuta_skriver_fil_med_kilde_tidspunkt_og_kurser(self):
        with tempfile.TemporaryDirectory() as d, \
                mock.patch.object(innhent, "DATA", d), \
                mock.patch.object(innhent, "hent_json", return_value=les("norgesbank.json")) as hent:
            innhent.valuta()
            ut = json.load(open(os.path.join(d, "valuta.json"), encoding="utf-8"))
        self.assertIn("EUR+USD+DKK+SEK", hent.call_args[0][0])
        self.assertIn("lastNObservations=2", hent.call_args[0][0])
        self.assertEqual(ut["kilde"], "Norges Bank")
        self.assertRegex(ut["oppdatert"], r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$")
        self.assertEqual(ut["kurser"], les("norgesbank.expected.json"))

    def test_valuta_og_appen_ber_om_samme_valutaer(self):
        html = open(os.path.join(ROT, "index.html"), encoding="utf-8").read()
        m = [x for x in __import__("re").findall(r'valutaer: \[([^\]]*)\]', html)][0]
        app = [v.strip().strip('"') for v in m.split(",")]
        self.assertEqual(app, innhent.VALUTAER)


class LesMorningstar(unittest.TestCase):
    def test_tolker_json_format_sortert_og_som_tall(self):
        k = innhent.les_morningstar(les("morningstar.json"))
        self.assertEqual(len(k), 1827)
        self.assertEqual(k[-1], ["2026-11-24", 841.5])
        self.assertEqual(k[-2], ["2026-11-23", 838.2])
        self.assertEqual([d for d, _ in k], sorted(d for d, _ in k))

    def test_tolker_compactjson(self):
        ms = lambda d: int(innhent.datetime(*d, tzinfo=innhent.timezone.utc).timestamp() * 1000)
        k = innhent.les_morningstar([[ms((2026, 11, 24)), 841.5], [ms((2026, 11, 23)), 838.2]])
        self.assertEqual(k, [["2026-11-23", 838.2], ["2026-11-24", 841.5]])

    def test_hopper_over_ugyldige_og_doble_datoer(self):
        js = {"TimeSeries": {"Security": [{"HistoryDetail": [
            {"EndDate": "2026-11-20", "Value": "10"}, {"EndDate": "2026-11-20", "Value": "11"},
            {"EndDate": "2026-11-21", "Value": ""}, {"EndDate": "tull", "Value": "5"},
            {"EndDate": "2026-11-22", "Value": "-1"}, {"EndDate": "2026-11-23T00:00:00", "Value": "12.5"}]}]}}
        self.assertEqual(innhent.les_morningstar(js), [["2026-11-20", 11.0], ["2026-11-23", 12.5]])

    def test_tomt_eller_ukjent_svar_gir_tom_liste(self):
        for js in ({}, {"TimeSeries": {}}, {"TimeSeries": {"Security": []}}, [], "x", None):
            self.assertEqual(innhent.les_morningstar(js), [])


class Fond(unittest.TestCase):
    def kjør(self, svar, gammel=None):
        """Kjører fond() mot simulert nett. svar: liste med svar/feil per kall, i rekkefølge."""
        kall = []

        def hent(url, headers=None, timeout=20):
            kall.append(url)
            r = svar[min(len(kall), len(svar)) - 1]
            if isinstance(r, Exception):
                raise r
            return r
        with tempfile.TemporaryDirectory() as d, mock.patch.object(innhent, "DATA", d), \
                mock.patch.object(innhent, "hent_json", side_effect=hent):
            if gammel is not None:
                os.makedirs(os.path.join(d, "fond"))
                json.dump(gammel, open(os.path.join(d, "fond", "dnb-global-indeks-a.json"), "w"))
            feil = None
            try:
                innhent.fond()
            except RuntimeError as e:
                feil = e
            fil = os.path.join(d, "fond", "dnb-global-indeks-a.json")
            data = json.load(open(fil)) if os.path.exists(fil) else None
            status = json.load(open(os.path.join(d, "fond-status.json")))
        return kall, data, status, feil

    def test_lagrer_hele_historikken_med_navn_isin_og_status(self):
        kall, data, status, feil = self.kjør([les("morningstar.json")])
        self.assertIsNone(feil)
        self.assertEqual(len(kall), 1, "første variant virket")
        self.assertIn("id=F00000JORS]2]0]FONOR$$ALL", kall[0])
        self.assertIn("currencyId=NOK", kall[0])
        self.assertIn("frequency=daily", kall[0])
        self.assertIn("outputType=JSON", kall[0])
        self.assertEqual(data["navn"], "DNB Global Indeks A")
        self.assertEqual(data["isin"], "NO0010582984")
        self.assertEqual(data["kurser"][-1], ["2026-11-24", 841.5])
        self.assertEqual(status["fond"]["dnb-global-indeks-a"]["variant"], 1)
        self.assertEqual(status["fond"]["dnb-global-indeks-a"]["siste"], ["2026-11-24", 841.5])

    def test_prøver_neste_variant_når_en_feiler_eller_er_tom(self):
        kall, data, status, _ = self.kjør([OSError("403"), {"TimeSeries": {}}, les("morningstar.json")])
        self.assertEqual(len(kall), 3)
        self.assertEqual(status["fond"]["dnb-global-indeks-a"]["variant"], 3)
        self.assertEqual(len(data["kurser"]), 1827)

    def test_alle_varianter_feiler_beholder_lagret_og_skriver_feilen(self):
        gammel = {"navn": "DNB Global Indeks A", "kurser": [["2026-11-20", 830.0]]}
        kall, data, status, feil = self.kjør([OSError("blokkert")], gammel)
        self.assertEqual(len(kall), len(innhent.MS_VARIANTER))
        self.assertEqual(data, gammel, "lagret fil røres ikke")
        st = status["fond"]["dnb-global-indeks-a"]
        self.assertFalse(st["ok"])
        self.assertIn("blokkert", st["feil"])
        self.assertEqual(st["siste_lagrede"], ["2026-11-20", 830.0])
        self.assertIsNotNone(feil, "jobben melder feil når ingen fond kunne hentes")

    def test_kort_svar_sletter_ikke_lang_historikk(self):
        gammel = {"kurser": [[f"2020-01-{i:02d}", 100.0] for i in range(1, 29)] * 3}
        kort = {"TimeSeries": {"Security": [{"HistoryDetail": [
            {"EndDate": f"2026-11-{i:02d}", "Value": "800"} for i in range(1, 25)]}]}}
        _, data, status, _ = self.kjør([kort], gammel)
        self.assertEqual(len(data["kurser"]), 84)
        self.assertIn("beholder lagret", status["fond"]["dnb-global-indeks-a"]["feil"])

    def test_fondlista_har_det_innhenteren_trenger(self):
        liste = json.load(open(os.path.join(ROT, "fond.json"), encoding="utf-8"))["fond"]
        self.assertGreaterEqual(len(liste), 1)
        ider = [f["id"] for f in liste]
        self.assertEqual(len(ider), len(set(ider)), "id må være unik")
        for f in liste:
            self.assertRegex(f["id"], r"^[a-z0-9-]+$")
            self.assertTrue(f["navn"])
            self.assertRegex(f["isin"], r"^[A-Z]{2}[A-Z0-9]{9}\d$")
            self.assertRegex(f["morningstar"], r"^(F0|0P)[0-9A-Z]{8}$")


class Arbeidsflyt(unittest.TestCase):
    def test_arbeidsflyten_kjører_innhenteren_og_lagrer_data(self):
        wf = open(os.path.join(ROT, ".github", "workflows", "innhent.yml"), encoding="utf-8").read()
        self.assertIn("python scripts/innhent.py", wf)
        self.assertIn("git add data/", wf)
        self.assertIn("contents: write", wf)

    def test_arbeidsflyten_kjører_når_fondlista_eller_innhenteren_endres(self):
        wf = open(os.path.join(ROT, ".github", "workflows", "innhent.yml"), encoding="utf-8").read()
        self.assertIn("push:", wf)
        for sti in ("fond.json", "scripts/innhent.py"):
            self.assertIn(sti, wf)


if __name__ == "__main__":
    unittest.main()
