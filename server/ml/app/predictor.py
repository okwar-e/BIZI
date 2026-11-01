from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer


FEATURE_ORDER = (
    "text_similarity",
    "semantic_similarity",
    "log_creator_followers",
    "log_creator_following",
    "log_creator_post_count",
    "baseline_er_missing",
)


def make_profile_text(display_name: Any, category: Any, bio: Any) -> str:
    parts = []
    for value in (display_name, category, bio):
        if value is not None and not pd.isna(value):
            text = str(value).strip().lower()
            if text:
                parts.append(text)
    return " ".join(parts)


def _count_column(frame: pd.DataFrame, column: str) -> np.ndarray:
    values = pd.to_numeric(frame[column], errors="coerce").to_numpy(dtype=np.float64)
    if not np.isfinite(values).all() or (values < 0).any():
        raise ValueError(f"Creator catalog contains invalid values in {column}")
    return values


class CreatorPredictor:
    def __init__(self, server_dir: Path | None = None) -> None:
        self.server_dir = server_dir or Path(__file__).resolve().parents[2]
        self.artifact_dir = self.server_dir / "Bizi_model_export"
        self._load_artifacts()

    def _load_artifacts(self) -> None:
        config_path = self.artifact_dir / "feature_config.json"
        config = json.loads(config_path.read_text(encoding="utf-8"))
        if tuple(config.get("features", ())) != FEATURE_ORDER:
            raise ValueError("feature_config.json does not match the required feature order")

        self.model = joblib.load(self.artifact_dir / "final_model.joblib")
        self.scaler = joblib.load(self.artifact_dir / "scaler.joblib")
        self.vectorizer = joblib.load(self.artifact_dir / "tfidf_vectorizer.joblib")

        scaler_features = tuple(getattr(self.scaler, "feature_names_in_", ()))
        if scaler_features != FEATURE_ORDER:
            raise ValueError("Saved scaler feature order does not match the required feature order")
        if getattr(self.model, "n_features_in_", None) != len(FEATURE_ORDER):
            raise ValueError("Saved model does not accept exactly six features")
        classes = np.asarray(getattr(self.model, "classes_", []))
        positive_classes = np.flatnonzero(classes == 1)
        if len(positive_classes) != 1:
            raise ValueError("Saved model does not expose a unique positive class labeled 1")
        self.positive_class_index = int(positive_classes[0])

        model_path = self.artifact_dir / "all-MiniLM-L6-v2"
        self.semantic_model = SentenceTransformer(
            str(model_path),
            local_files_only=True,
        )

        self.creators = pd.read_csv(self.artifact_dir / "creator_profiles.csv")
        required_columns = {
            "creator_username",
            "creator_display_name",
            "creator_followers",
            "creator_following",
            "creator_post_count",
            "creator_category",
            "creator_bio",
        }
        missing_columns = required_columns.difference(self.creators.columns)
        if missing_columns:
            raise ValueError("Creator catalog is missing required columns")
        if self.creators.empty:
            raise ValueError("Creator catalog contains no creators")

        self.creator_texts = [
            make_profile_text(row.creator_display_name, row.creator_category, row.creator_bio)
            for row in self.creators.itertuples(index=False)
        ]
        self.creator_tfidf = self.vectorizer.transform(self.creator_texts)
        self.creator_embeddings = self.semantic_model.encode(
            self.creator_texts,
            batch_size=64,
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        self.followers = _count_column(self.creators, "creator_followers")
        self.following = _count_column(self.creators, "creator_following")
        self.post_counts = _count_column(self.creators, "creator_post_count")

    @property
    def creator_count(self) -> int:
        return len(self.creators)

    def recommend(self, business: dict[str, str], top_n: int = 10) -> list[dict[str, Any]]:
        brand_text = make_profile_text(
            business["name"], business["category"], business["description"]
        )
        if not brand_text:
            raise ValueError("Business name, category, and description cannot all be empty")

        brand_tfidf = self.vectorizer.transform([brand_text])
        text_similarity = np.asarray(
            (self.creator_tfidf @ brand_tfidf.T).toarray()
        ).reshape(-1)

        brand_embedding = self.semantic_model.encode(
            [brand_text],
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        )[0]
        semantic_similarity = self.creator_embeddings @ brand_embedding

        # Historical engagement evidence is absent from the live export; this constant does not affect candidate ordering.
        baseline_er_missing = np.ones(self.creator_count, dtype=np.float64)
        feature_matrix = np.column_stack(
            (
                text_similarity,
                semantic_similarity,
                np.log1p(self.followers),
                np.log1p(self.following),
                np.log1p(self.post_counts),
                baseline_er_missing,
            )
        )
        if feature_matrix.shape != (self.creator_count, len(FEATURE_ORDER)):
            raise ValueError("Inference feature matrix has an unexpected shape")
        if not np.isfinite(feature_matrix).all():
            raise ValueError("Inference features contain non-finite values")

        named_features = pd.DataFrame(feature_matrix, columns=FEATURE_ORDER)
        scaled_features = self.scaler.transform(named_features)
        coefficient_values = self.model.coef_[0]
        contribution_matrix = scaled_features * coefficient_values
        intercept = float(self.model.intercept_[0])
        scores = self.model.predict_proba(scaled_features)[:, self.positive_class_index]
        if not np.isfinite(scores).all():
            raise ValueError("Model returned non-finite recommendation scores")

        ordered_indices = np.argsort(-scores, kind="stable")[:top_n]
        recommendations = []
        for rank, index in enumerate(ordered_indices, start=1):
            row = self.creators.iloc[index]
            recommendations.append(
                {
                    "creator_username": str(row["creator_username"]),
                    "creator_display_name": self._optional_text(row["creator_display_name"])
                    or str(row["creator_username"]),
                    "creator_followers": int(self.followers[index]),
                    "creator_following": int(self.following[index]),
                    "creator_post_count": int(self.post_counts[index]),
                    "creator_website": self._optional_text(row["creator_website"]),
                    "creator_category": self._optional_text(row["creator_category"]),
                    "creator_bio": self._optional_text(row["creator_bio"]),
                    "score": float(scores[index]),
                    "rank": rank,
                    "feature_values": {
                        feature: float(feature_matrix[index, feature_index])
                        for feature_index, feature in enumerate(FEATURE_ORDER)
                    },
                    "model_contributions": [
                        {
                            "feature": feature,
                            "standardized_value": float(scaled_features[index, feature_index]),
                            "contribution": float(contribution_matrix[index, feature_index]),
                        }
                        for feature_index, feature in enumerate(FEATURE_ORDER)
                    ],
                    "model_intercept": intercept,
                }
            )
        return recommendations

    @staticmethod
    def _optional_text(value: Any) -> str | None:
        return None if value is None or pd.isna(value) else str(value)