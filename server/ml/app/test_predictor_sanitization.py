import unittest

from predictor import make_profile_text, sanitize_contact_details


class CreatorBioSanitizationTests(unittest.TestCase):
    def test_removes_email_and_phone_from_returned_bio(self):
        bio = "Beauty creator. Email person@example.test or call +1 (212) 555-0199."
        safe = sanitize_contact_details(bio)
        self.assertNotIn("person@example.test", safe)
        self.assertNotIn("212", safe)
        self.assertEqual(safe.count("[contact removed]"), 2)

    def test_contact_details_do_not_enter_model_text(self):
        text = make_profile_text("Creator", "Beauty", "person@example.test; +1 (212) 555-0199")
        self.assertNotIn("person@example.test", text)
        self.assertNotIn("212", text)


if __name__ == "__main__":
    unittest.main()
