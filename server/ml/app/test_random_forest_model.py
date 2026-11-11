import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd


ARTIFACT_DIR = Path(__file__).resolve().parents[2] / "Bizi_model_export"
FEATURE_ORDER = (
    "text_similarity",
    "semantic_similarity",
    "log_creator_followers",
    "log_creator_following",
    "log_creator_post_count",
    "baseline_er_missing",
)


def test_random_forest_artifact_matches_serving_contract():
    config = json.loads((ARTIFACT_DIR / "feature_config.json").read_text(encoding="utf-8"))
    model = joblib.load(ARTIFACT_DIR / "final_model.joblib")

    assert config["model"] == "RandomForestClassifier"
    assert tuple(config["features"]) == FEATURE_ORDER
    assert tuple(model.feature_names_in_) == FEATURE_ORDER
    assert type(model.named_steps["classifier"]).__name__ == "RandomForestClassifier"

    features = pd.DataFrame(
        [
            [0.2, 0.3, 5.0, 3.0, 2.0, 1.0],
            [0.8, 0.7, 9.0, 6.0, 7.0, 1.0],
        ],
        columns=FEATURE_ORDER,
    )
    probabilities = model.predict_proba(features)
    importances = model.named_steps["classifier"].feature_importances_

    assert probabilities.shape == (2, 2)
    assert np.isfinite(probabilities).all()
    assert ((probabilities >= 0) & (probabilities <= 1)).all()
    assert np.isclose(probabilities.sum(axis=1), 1).all()
    assert importances.shape == (len(FEATURE_ORDER),)
    assert np.isfinite(importances).all()
    assert (importances >= 0).all()
