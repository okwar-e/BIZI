from pathlib import Path

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_percentage_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder


BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR.parent / "data" / "influencer_marketing_roi_dataset.csv"
MODELS_DIR = BASE_DIR / "models"

NUMERIC_FEATURES = [
    "engagement_rate",
    "estimated_reach",
    "campaign_duration_days",
]
CATEGORICAL_FEATURES = ["platform", "influencer_category"]
FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES


def build_preprocessor():
    return ColumnTransformer(
        transformers=[
            ("numeric", "passthrough", NUMERIC_FEATURES),
            (
                "categorical",
                OneHotEncoder(handle_unknown="ignore"),
                CATEGORICAL_FEATURES,
            ),
        ]
    )


def evaluate_model(name, model, x_test, y_test):
    predictions = model.predict(x_test)
    rmse = mean_squared_error(y_test, predictions) ** 0.5
    r2 = r2_score(y_test, predictions)
    mape = mean_absolute_percentage_error(y_test, predictions)
    print(f"{name} RMSE: {rmse:.4f}")
    print(f"{name} R2: {r2:.4f}")
    print(f"{name} MAPE: {mape:.4f}")
    return {"name": name, "rmse": rmse, "r2": r2, "mape": mape}


def main():
    print(f"Loading dataset: {DATA_PATH}")
    data = pd.read_csv(DATA_PATH)

    if data["estimated_reach"].eq(0).any():
        raise ValueError("estimated_reach contains zero values; engagement_rate cannot be calculated")

    data["engagement_rate"] = data["engagements"] / data["estimated_reach"]
    data["revenue"] = data["product_sales"] * 40
    data["campaign_cost"] = 500 + data["estimated_reach"] * 0.01
    data["roi"] = (data["revenue"] - data["campaign_cost"]) / data["campaign_cost"] * 100

    print("\nROI target summary")
    print(data["roi"].describe())

    x = data[FEATURES]
    y = data["roi"]
    x_train, x_test, y_train, y_test = train_test_split(
        x, y, test_size=0.2, random_state=42
    )

    linear_model = Pipeline(
        steps=[
            ("preprocessor", build_preprocessor()),
            ("model", LinearRegression()),
        ]
    )
    forest_model = Pipeline(
        steps=[
            ("preprocessor", build_preprocessor()),
            ("model", RandomForestRegressor(n_estimators=100, random_state=42)),
        ]
    )

    linear_model.fit(x_train, y_train)
    forest_model.fit(x_train, y_train)

    print(f"Rows: {len(data)} | Training rows: {len(x_train)} | Test rows: {len(x_test)}")
    print("\nTest metrics")
    linear_metrics = evaluate_model("Linear Regression", linear_model, x_test, y_test)
    forest_metrics = evaluate_model("Random Forest", forest_model, x_test, y_test)

    feature_names = linear_model.named_steps["preprocessor"].get_feature_names_out()
    coefficients = linear_model.named_steps["model"].coef_
    print("\nLinear Regression coefficients")
    for feature_name, coefficient in zip(feature_names, coefficients):
        print(f"{feature_name}: {coefficient:.6f}")

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    linear_path = MODELS_DIR / "linear_regression_roi.joblib"
    forest_path = MODELS_DIR / "random_forest_roi.joblib"
    joblib.dump(linear_model, linear_path)
    joblib.dump(forest_model, forest_path)
    print(f"\nSaved Linear Regression model: {linear_path}")
    print(f"Saved Random Forest model: {forest_path}")

    better = min((linear_metrics, forest_metrics), key=lambda result: result["rmse"])
    print("\nModel comparison")
    print(
        f"Linear Regression: RMSE={linear_metrics['rmse']:.4f}, "
        f"R2={linear_metrics['r2']:.4f}, "
        f"MAPE={linear_metrics['mape']:.4f}"
    )
    print(
        f"Random Forest: RMSE={forest_metrics['rmse']:.4f}, "
        f"R2={forest_metrics['r2']:.4f}, "
        f"MAPE={forest_metrics['mape']:.4f}"
    )
    print(f"Better test-set performer by RMSE: {better['name']}")


if __name__ == "__main__":
    main()
