from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import FastAPI, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .predictor import CreatorPredictor


class BusinessInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=255)
    category: str = Field(min_length=1, max_length=255)
    description: str = Field(min_length=1, max_length=5000)

    @field_validator("name", "category", "description")
    @classmethod
    def trim_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Field cannot be blank")
        return value


class CampaignInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=5000)
    objective: str | None = Field(default=None, max_length=2000)
    targetAudience: str | None = Field(default=None, max_length=2000)
    platform: str | None = Field(default=None, max_length=255)
    location: str | None = Field(default=None, max_length=255)
    budget: float | None = Field(default=None, ge=0)


class CreatorInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    creator_id: int = Field(gt=0)
    creator_username: str = Field(min_length=1, max_length=255)
    creator_display_name: str = Field(min_length=1, max_length=255)
    creator_followers: int | None = Field(default=None, ge=0)
    creator_following: int | None = Field(default=None, ge=0)
    creator_post_count: int | None = Field(default=None, ge=0)
    creator_website: str | None = Field(default=None, max_length=2048)
    creator_category: str = Field(min_length=1, max_length=255)
    creator_bio: str = Field(max_length=10000)
    is_sample_account: bool = False


class RecommendRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    business: BusinessInput
    campaign: CampaignInput | None = None
    creators: list[CreatorInput] | None = Field(default=None, max_length=5000)


class WarmupRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    creators: list[CreatorInput] = Field(min_length=1, max_length=5000)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.predictor = CreatorPredictor()
    yield
    del app.state.predictor


app = FastAPI(title="Bizi Creator Recommendation Service", lifespan=lifespan)


@app.get("/health")
def health(request: Request) -> dict[str, int | str | bool]:
    predictor = getattr(request.app.state, "predictor", None)
    if predictor is None:
        raise HTTPException(status_code=503, detail="Recommendation model is not ready")
    return {
        "status": "ok",
        "model_loaded": True,
        "creator_count": predictor.creator_count,
        "feature_count": 6,
        "cached_embedding_count": predictor.cached_embedding_count,
        "embedding_cache_warming": predictor.embedding_cache_warming,
    }


@app.post("/warmup")
def warmup(payload: WarmupRequest, request: Request) -> dict[str, int | bool | str]:
    predictor = getattr(request.app.state, "predictor", None)
    if predictor is None:
        raise HTTPException(status_code=503, detail="Recommendation model is not ready")
    try:
        predictor.start_embedding_warmup(
            [creator.model_dump() for creator in payload.creators]
        )
    except Exception as error:
        raise HTTPException(status_code=503, detail="Recommendation cache warmup failed") from error
    return {
        "status": "warming" if predictor.embedding_cache_warming else "ready",
        "cached_embedding_count": predictor.cached_embedding_count,
        "embedding_cache_warming": predictor.embedding_cache_warming,
    }


@app.post("/recommend")
def recommend(
    payload: RecommendRequest,
    request: Request,
    top_n: Annotated[int, Query(ge=1, le=100)] = 10,
) -> dict[str, object]:
    predictor = getattr(request.app.state, "predictor", None)
    if predictor is None:
        raise HTTPException(status_code=503, detail="Recommendation model is not ready")
    try:
        creators = (
            [creator.model_dump() for creator in payload.creators]
            if payload.creators is not None
            else None
        )
        recommendations = predictor.recommend(
            payload.business.model_dump(), top_n=top_n, creators=creators
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail="Invalid business information") from error
    except Exception as error:
        raise HTTPException(status_code=503, detail="Recommendation service unavailable") from error
    return {"recommendations": recommendations}