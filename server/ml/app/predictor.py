from __future__ import annotations

import hashlib
import json
import re
import threading
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import torch
from sentence_transformers import SentenceTransformer


FEATURE_ORDER = (
    "text_similarity",
    "semantic_similarity",
    "log_creator_followers",
    "log_creator_following",
    "log_creator_post_count",
    "baseline_er_missing",
)
EMBEDDING_BATCH_SIZE = 16
EMAIL_PATTERN = re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b")
PHONE_PATTERN = re.compile(r"(?<!\w)\+?[\d(][\d().\s-]{7,}\d(?!\w)")


def sanitize_contact_details(value: Any) -> str:
    text = "" if value is None or pd.isna(value) else str(value)
    text = EMAIL_PATTERN.sub("[contact removed]", text)

    def remove_phone(match: re.Match[str]) -> str:
        return "[contact removed]" if sum(character.isdigit() for character in match.group()) >= 9 else match.group()

    return re.sub(r"\s+", " ", PHONE_PATTERN.sub(remove_phone, text)).strip()


def make_profile_text(display_name: Any, category: Any, bio: Any) -> str:
    parts = []
    for value in (display_name, category, sanitize_contact_details(bio)):
        if value is not None and not pd.isna(value):
            text = str(value).strip().lower()
            if text:
                parts.append(text)
    return " ".join(parts)


def _count_column(frame: pd.DataFrame, column: str) -> np.ndarray:
    values = pd.to_numeric(frame[column], errors="coerce").to_numpy(dtype=np.float64)
    values = np.where(np.isnan(values), 0.0, values)
    if not np.isfinite(values).all() or (values < 0).any():
        raise ValueError(f"Creator catalog contains invalid values in {column}")
    return values


class CreatorPredictor:
    def __init__(self, server_dir: Path | None = None) -> None:
        self.server_dir = server_dir or Path(__file__).resolve().parents[2]
        self.artifact_dir = self.server_dir / "Bizi_model_export"
        self._embedding_cache: dict[tuple[int, str], np.ndarray] = {}
        self._embedding_cache_lock = threading.Lock()
        self._embedding_encode_lock = threading.Lock()
        self._catalog_features_lock = threading.Lock()
        self._embedding_cache_warming = False
        self._catalog_features: tuple[Any, np.ndarray] | None = None
        self._load_artifacts()

    def _load_artifacts(self) -> None:
        config_path = self.artifact_dir / "feature_config.json"
        config = json.loads(config_path.read_text(encoding="utf-8"))
        if tuple(config.get("features", ())) != FEATURE_ORDER:
            raise ValueError("feature_config.json does not match the required feature order")

        self.model = joblib.load(self.artifact_dir / "final_model.joblib")
        self.vectorizer = joblib.load(self.artifact_dir / "tfidf_vectorizer.joblib")

        if getattr(self.model, "n_features_in_", None) != len(FEATURE_ORDER):
            raise ValueError("Saved model does not accept exactly six features")
        model_features = tuple(getattr(self.model, "feature_names_in_", ()))
        if model_features != FEATURE_ORDER:
            raise ValueError("Saved model feature order does not match the required feature order")
        if not callable(getattr(self.model, "predict_proba", None)):
            raise ValueError("Saved model does not expose class probabilities")
        classes = np.asarray(getattr(self.model, "classes_", []))
        positive_classes = np.flatnonzero(classes == 1)
        if len(positive_classes) != 1:
            raise ValueError("Saved model does not expose a unique positive class labeled 1")
        self.positive_class_index = int(positive_classes[0])
        classifier = getattr(self.model, "named_steps", {}).get("classifier", self.model)
        importances = np.asarray(
            getattr(classifier, "feature_importances_", []), dtype=np.float64
        )
        if (
            importances.shape != (len(FEATURE_ORDER),)
            or not np.isfinite(importances).all()
            or (importances < 0).any()
        ):
            raise ValueError("Saved model does not expose valid feature importances")
        self.model_feature_importances = [
            {"feature": feature, "importance": float(importances[index])}
            for index, feature in enumerate(FEATURE_ORDER)
        ]

        model_path = self.artifact_dir / "all-MiniLM-L6-v2"
        self.semantic_model = SentenceTransformer(
            str(model_path),
            local_files_only=True,
            model_kwargs={"torch_dtype": torch.float16},
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
        self.followers = _count_column(self.creators, "creator_followers")
        self.following = _count_column(self.creators, "creator_following")
        self.post_counts = _count_column(self.creators, "creator_post_count")

    def _catalog_feature_matrices(self) -> tuple[Any, np.ndarray]:
        if self._catalog_features is None:
            with self._catalog_features_lock:
                if self._catalog_features is None:
                    creator_tfidf = self.vectorizer.transform(self.creator_texts)
                    creator_embeddings = self.semantic_model.encode(
                        self.creator_texts,
                        batch_size=EMBEDDING_BATCH_SIZE,
                        convert_to_numpy=True,
                        normalize_embeddings=True,
                        show_progress_bar=False,
                    )
                    self._catalog_features = (creator_tfidf, creator_embeddings)
        return self._catalog_features

    @property
    def creator_count(self) -> int:
        return len(self.creators)

    @property
    def cached_embedding_count(self) -> int:
        with self._embedding_cache_lock:
            return len(self._embedding_cache)

    @property
    def embedding_cache_warming(self) -> bool:
        with self._embedding_cache_lock:
            return self._embedding_cache_warming

    @staticmethod
    def _embedding_cache_key(creator_id: int, text: str) -> tuple[int, str]:
        return int(creator_id), hashlib.sha256(text.encode("utf-8")).hexdigest()

    def _creator_embeddings(
        self, candidate_frame: pd.DataFrame, creator_texts: list[str]
    ) -> np.ndarray:
        keys = [
            self._embedding_cache_key(creator_id, text)
            for creator_id, text in zip(candidate_frame["creator_id"], creator_texts)
        ]
        with self._embedding_encode_lock:
            with self._embedding_cache_lock:
                missing: dict[tuple[int, str], str] = {}
                for key, text in zip(keys, creator_texts):
                    if key not in self._embedding_cache:
                        missing.setdefault(key, text)

            missing_items = list(missing.items())
            for offset in range(0, len(missing_items), EMBEDDING_BATCH_SIZE):
                batch = missing_items[offset : offset + EMBEDDING_BATCH_SIZE]
                embeddings = self.semantic_model.encode(
                    [text for _, text in batch],
                    batch_size=EMBEDDING_BATCH_SIZE,
                    convert_to_numpy=True,
                    normalize_embeddings=True,
                    show_progress_bar=False,
                )
                with self._embedding_cache_lock:
                    for (key, _), embedding in zip(batch, embeddings):
                        self._embedding_cache.setdefault(key, embedding)

        with self._embedding_cache_lock:
            return np.stack([self._embedding_cache[key] for key in keys])

    def start_embedding_warmup(self, creators: list[dict[str, Any]]) -> bool:
        if not creators:
            return False
        candidate_frame = pd.DataFrame(creators)
        creator_texts = [
            make_profile_text(row.creator_display_name, row.creator_category, row.creator_bio)
            for row in candidate_frame.itertuples(index=False)
        ]
        keys = [
            self._embedding_cache_key(creator_id, text)
            for creator_id, text in zip(candidate_frame["creator_id"], creator_texts)
        ]
        with self._embedding_cache_lock:
            if self._embedding_cache_warming or all(key in self._embedding_cache for key in keys):
                return False
            self._embedding_cache_warming = True

        def warm() -> None:
            try:
                self._creator_embeddings(candidate_frame, creator_texts)
            finally:
                with self._embedding_cache_lock:
                    self._embedding_cache_warming = False

        threading.Thread(target=warm, daemon=True).start()
        return True

    def recommend(
        self,
        business: dict[str, str],
        top_n: int = 10,
        creators: list[dict[str, Any]] | None = None,
    ) -> list[dict[str, Any]]:
        brand_text = make_profile_text(
            business["name"], business["category"], business["description"]
        )
        if not brand_text:
            raise ValueError("Business name, category, and description cannot all be empty")

        if creators is None:
            candidate_frame = self.creators
            creator_tfidf, creator_embeddings = self._catalog_feature_matrices()
            followers = self.followers
            following = self.following
            post_counts = self.post_counts
        else:
            candidate_frame = pd.DataFrame(creators)
            required_columns = {
                "creator_id",
                "creator_username",
                "creator_display_name",
                "creator_followers",
                "creator_following",
                "creator_post_count",
                "creator_category",
                "creator_bio",
            }
            if candidate_frame.empty or required_columns.difference(candidate_frame.columns):
                raise ValueError("Creator candidates are missing required model features")
            creator_texts = [
                make_profile_text(row.creator_display_name, row.creator_category, row.creator_bio)
                for row in candidate_frame.itertuples(index=False)
            ]
            followers = _count_column(candidate_frame, "creator_followers")
            following = _count_column(candidate_frame, "creator_following")
            post_counts = _count_column(candidate_frame, "creator_post_count")
            catalog_matches = (
                candidate_frame["creator_username"].astype(str).tolist()
                == self.creators["creator_username"].astype(str).tolist()
                and creator_texts == self.creator_texts
                and np.array_equal(followers, self.followers)
                and np.array_equal(following, self.following)
                and np.array_equal(post_counts, self.post_counts)
            )
            if catalog_matches:
                creator_tfidf, creator_embeddings = self._catalog_feature_matrices()
            else:
                creator_tfidf = self.vectorizer.transform(creator_texts)
                creator_embeddings = self._creator_embeddings(candidate_frame, creator_texts)

        candidate_count = len(candidate_frame)
        brand_tfidf = self.vectorizer.transform([brand_text])
        text_similarity = np.asarray(
            (creator_tfidf @ brand_tfidf.T).toarray()
        ).reshape(-1)

        brand_embedding = self.semantic_model.encode(
            [brand_text],
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        )[0]
        semantic_similarity = creator_embeddings @ brand_embedding

        # Historical engagement evidence is absent from the live export; this constant does not affect candidate ordering.
        baseline_er_missing = np.ones(candidate_count, dtype=np.float64)
        feature_matrix = np.column_stack(
            (
                text_similarity,
                semantic_similarity,
                np.log1p(followers),
                np.log1p(following),
                np.log1p(post_counts),
                baseline_er_missing,
            )
        )
        if feature_matrix.shape != (candidate_count, len(FEATURE_ORDER)):
            raise ValueError("Inference feature matrix has an unexpected shape")
        if not np.isfinite(feature_matrix).all():
            raise ValueError("Inference features contain non-finite values")

        named_features = pd.DataFrame(feature_matrix, columns=FEATURE_ORDER)
        scores = self.model.predict_proba(named_features)[:, self.positive_class_index]
        if not np.isfinite(scores).all():
            raise ValueError("Model returned non-finite recommendation scores")

        ordered_indices = np.argsort(-scores, kind="stable")[:top_n]
        recommendations = []
        for rank, index in enumerate(ordered_indices, start=1):
            row = candidate_frame.iloc[index]
            missing_metrics = [
                feature
                for column, feature in (
                    ("creator_followers", "followers"),
                    ("creator_following", "following"),
                    ("creator_post_count", "post count"),
                )
                if pd.isna(row[column])
            ]
            recommendations.append(
                {
                    "creator_username": str(row["creator_username"]),
                    "creator_display_name": self._optional_text(row["creator_display_name"])
                    or str(row["creator_username"]),
                    "creator_followers": self._optional_count(row["creator_followers"]),
                    "creator_following": self._optional_count(row["creator_following"]),
                    "creator_post_count": self._optional_count(row["creator_post_count"]),
                    "creator_website": self._optional_text(row.get("creator_website")),
                    "creator_category": self._optional_text(row["creator_category"]),
                    "creator_bio": sanitize_contact_details(row["creator_bio"]),
                    "creator_id": int(row["creator_id"]) if creators is not None else None,
                    "is_sample_account": bool(row.get("is_sample_account", False)),
                    "missing_model_metrics": missing_metrics,
                    "score": float(scores[index]),
                    "rank": rank,
                    "feature_values": {
                        feature: float(feature_matrix[index, feature_index])
                        for feature_index, feature in enumerate(FEATURE_ORDER)
                    },
                    "model_feature_importances": [
                        dict(item) for item in self.model_feature_importances
                    ],
                }
            )
        return recommendations

    @staticmethod
    def _optional_text(value: Any) -> str | None:
        return None if value is None or pd.isna(value) else str(value)

    @staticmethod
    def _optional_count(value: Any) -> int | None:
        return None if value is None or pd.isna(value) else int(value)