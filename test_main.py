import unittest

from main import analyze, apa_reply, extract


def incoming(text):
    return {"role": "scammer", "text": text}


class DemoLogicTests(unittest.TestCase):
    def test_compensation_scenario_extracts_payment_and_explains_high_risk(self):
        messages = [
            incoming("Вам положена компенсация от ЕНПФ, но сначала оплатите страховку. Только сегодня"),
            incoming("Переведите на карту 4111 1111 1111 1111"),
        ]
        result = analyze(messages)
        self.assertEqual(result["risk"], "high")
        self.assertEqual(result["score"], 9)
        self.assertIn("4111111111111111", [r["value"] for r in result["requisites"]])
        self.assertIn("private_payment", [s["key"] for s in result["signals"]])

    def test_benign_wrong_number_stays_low_risk_and_apa_leaves(self):
        messages = [incoming("Здравствуйте, это номер парикмахерской?")]
        self.assertEqual(analyze(messages)["risk"], "low")
        self.assertIn("ошиблись номером", apa_reply(messages))

    def test_apa_does_not_share_a_code(self):
        self.assertIn("не называю", apa_reply([incoming("Продиктуйте код из смс")]))

    def test_phone_is_normalized(self):
        self.assertIn("+77001234567", [r["value"] for r in extract("Переведите на Kaspi +7 700 123 45 67")])


if __name__ == "__main__":
    unittest.main()
