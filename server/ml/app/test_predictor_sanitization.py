import math
import unittest

from predictor import CreatorPredictor, make_profile_text, sanitize_contact_details


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


def test_campaign_64_top_ten_is_stable_with_random_forest_embedding_cache():
    creator_values = [
        (1680, "SAMPLE_2ECF8BBDA2A2FBC5E3DE", "Nifesimi \U0001f4cdDMV", 66968, 805, 2657, "Creators & Celebrities", "Fashion + Lifestyle + Mommy(ing) #fashion #lifestyle #mommy \U0001f48c [contact removed]"),
        (967, "SAMPLE_CACEE13F7C5A5188C9A6", "Divani Vasil", 521223, 460, 1324, "Creators & Celebrities", "Fashion and Lifestyle Blogger \U0001f4cd: TJ | SD \u2709: [contact removed]"),
        (1381, "SAMPLE_10CEBC5402CE6B1A8A65", "E R I C  W E R T Z", 41276, 1056, 1278, "Creators & Celebrities", "fashion \u25aa lifestyle \u25aa family \u25aa travel \U0001f4cdNew York \u2718 [contact removed]"),
        (1525, "SAMPLE_4A8FF2B36ED71F73513B", "LETITIA KIU", 7778, 424, 1150, "Creators & Celebrities", "Toronto Fashion & Lifestyle #YouTuber *\uff65\u3015THRIFTING FALL TRENDS\u3014\uff65*"),
        (2235, "SAMPLE_16ED365FFCF6A0AF5017", "Laura", 95249, 344, 2940, "Creators & Celebrities", "Paris Fashion - Lifestyle - Travel Blogger"),
        (466, "SAMPLE_BF55826FB41764FA90FF", "JUST YENTL", 165347, 754, 1274, "Creators & Celebrities", "world explorer with a \u2661 for fashion and lifestyle ||| living in antwerp \u27b3 [contact removed]"),
        (681, "SAMPLE_57AE6092B6A0881DD7A4", "HELLO! Pakistan", 922245, 1120, 53844, "Publishers", "Pakistan's first international fashion & lifestyle mag. Get your daily dose of fashion, beauty & celeb news \U0001f4f8 snapchat @hellopakistan"),
        (2620, "SAMPLE_EAD5D4FFD5D388E8B317", "Out Magazine", 303954, 475, 2972, "Publishers", "The world's leading #LGBTQ fashion & lifestyle magazine."),
        (1476, "SAMPLE_2BD26CCF46C13C099ABF", "Julia Jasmin R\u00fchle aka JJ", 326342, 524, 1800, "Creators & Celebrities", "\u2022 Fashion \u2022 Lifestyle \u2022 Fitness \u2022 Beauty \u2022 #jj #juliajasminr\u00fchle_aka_jj #juliajasminr\u00fchle #juliajasminruehle #juliajasmin #juliajasmin_aka_jj"),
        (518, "SAMPLE_CC847FCEE99A469BFC00", "Samantha Wennerstrom", 128434, 802, 3292, "Creators & Celebrities", "Fashion | Lifestyle | Beauty | Travel | Motherhood [contact removed]"),
    ]
    creators = [
        {
            "creator_id": creator_id,
            "creator_username": username,
            "creator_display_name": display_name,
            "creator_followers": followers,
            "creator_following": following,
            "creator_post_count": post_count,
            "creator_website": None,
            "creator_category": category,
            "creator_bio": bio,
            "is_sample_account": True,
        }
        for creator_id, username, display_name, followers, following, post_count, category, bio in creator_values
    ]
    business = {"name": "bizi", "category": "fashion", "description": "lifestyle"}
    predictor = CreatorPredictor()

    before = predictor.recommend(business, top_n=10, creators=creators)
    after = predictor.recommend(business, top_n=10, creators=creators)

    assert type(predictor.model.named_steps["classifier"]).__name__ == "RandomForestClassifier"
    assert len(before) == 10
    assert all(0 <= row["score"] <= 1 for row in before)
    assert all(
        before[index]["score"] >= before[index + 1]["score"]
        for index in range(len(before) - 1)
    )
    assert [row["creator_id"] for row in after] == [row["creator_id"] for row in before]
    assert all(abs(after_row["score"] - before_row["score"]) <= 1e-6 for before_row, after_row in zip(before, after))
    expected_features = {
        "text_similarity",
        "semantic_similarity",
        "log_creator_followers",
        "log_creator_following",
        "log_creator_post_count",
        "baseline_er_missing",
    }
    assert all(
        {item["feature"] for item in row["model_feature_importances"]} == expected_features
        for row in before
    )
    assert all(
        math.isfinite(item["importance"]) and item["importance"] >= 0
        for row in before
        for item in row["model_feature_importances"]
    )
    assert predictor.cached_embedding_count == len(creators)


if __name__ == "__main__":
    unittest.main()
