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


class RecommendRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    business: BusinessInput
    campaign: CampaignInput | None = None


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
        recommendations = predictor.recommend(payload.business.model_dump(), top_n=top_n)
    except ValueError as error:
        raise HTTPException(status_code=400, detail="Invalid business information") from error
    except Exception as error:
        raise HTTPException(status_code=503, detail="Recommendation service unavailable") from error
    return {"recommendations": recommendations}