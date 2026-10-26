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


class Arbeidsflyt(unittest.TestCase):
    def test_arbeidsflyten_kjører_innhenteren_og_lagrer_data(self):
        wf = open(os.path.join(ROT, ".github", "workflows", "innhent.yml"), encoding="utf-8").read()
        self.assertIn("python scripts/innhent.py", wf)
        self.assertIn("git add data/", wf)
        self.assertIn("contents: write", wf)


if __name__ == "__main__":
    unittest.main()
