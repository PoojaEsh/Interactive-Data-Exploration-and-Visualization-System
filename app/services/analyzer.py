from collections import Counter

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.linear_model import LinearRegression

from app.models.insight import Insight


def get_excel_sheets(file_path):
    excel_file = pd.ExcelFile(file_path)
    return excel_file.sheet_names


def detect_machine_column(columns):
    for col in columns:
        name = str(col).strip().lower()
        if (
            name == "mc"
            or name == "machine"
            or "machine no" in name
            or "machine number" in name
            or "mc no" in name
            or "mc number" in name
        ):
            return col
    return columns[0] if columns else None


def detect_shift_column(columns):
    for col in columns:
        if "shift" in str(col).strip().lower():
            return col
    return None


def normalize_shift(value):
    shift = str(value).strip().upper()

    if "E" in shift:
        return "E"
    if "L" in shift:
        return "L"
    if "N" in shift:
        return "N"

    return shift or "Unknown"


def _safe_float(value, default=0.0):
    try:
        if pd.isna(value):
            return float(default)
        return float(value)
    except Exception:
        return float(default)


def _machine_sort_key(value):
    text = str(value).strip()
    try:
        return (0, float(text))
    except Exception:
        return (1, text.lower())


def clean_dataframe(df: pd.DataFrame):
    report = {
        "missing_before": {},
        "filled_columns": {},
        "outliers_capped": {}
    }

    cleaned = df.copy()
    cleaned = cleaned.dropna(axis=1, how="all")
    cleaned.columns = [str(col).strip() for col in cleaned.columns]
    cleaned = cleaned.loc[:, ~cleaned.columns.astype(str).str.contains("^Unnamed", na=False)]

    for col in cleaned.columns:
        cleaned[col] = cleaned[col].replace(r"^\s*$", np.nan, regex=True)
        report["missing_before"][col] = int(cleaned[col].isna().sum())

    numeric_candidates = []
    for col in cleaned.columns:
        converted = pd.to_numeric(cleaned[col], errors="coerce")
        if converted.notna().sum() > 0:
            numeric_candidates.append(col)

    for col in numeric_candidates:
        cleaned[col] = pd.to_numeric(cleaned[col], errors="coerce")

    for col in cleaned.columns:
        missing_count = int(cleaned[col].isna().sum())
        if missing_count == 0:
            continue

        if col in numeric_candidates:
            median_value = cleaned[col].median()
            cleaned[col] = cleaned[col].fillna(median_value)
            report["filled_columns"][col] = {
                "method": "median",
                "filled_count": missing_count,
                "value_used": None if pd.isna(median_value) else float(median_value)
            }
        else:
            mode_series = cleaned[col].mode(dropna=True)
            mode_value = mode_series.iloc[0] if not mode_series.empty else "Unknown"
            cleaned[col] = cleaned[col].fillna(mode_value)
            report["filled_columns"][col] = {
                "method": "mode",
                "filled_count": missing_count,
                "value_used": str(mode_value)
            }

    for col in numeric_candidates:
        series = cleaned[col]
        q1 = series.quantile(0.25)
        q3 = series.quantile(0.75)
        iqr = q3 - q1

        if pd.isna(iqr) or iqr == 0:
            continue

        lower = q1 - 1.5 * iqr
        upper = q3 + 1.5 * iqr

        before = series.copy()
        cleaned[col] = series.clip(lower=lower, upper=upper)

        capped_count = int((before != cleaned[col]).sum())
        if capped_count > 0:
            report["outliers_capped"][col] = {
                "count": capped_count,
                "lower_bound": float(lower),
                "upper_bound": float(upper)
            }

    cleaned = cleaned.replace({np.nan: ""})

    return cleaned, report


def load_dataset_frame(file_path, sheet_name=None):
    if file_path.endswith(".csv"):
        df = pd.read_csv(file_path)
    else:
        excel = pd.ExcelFile(file_path)
        selected_sheet = sheet_name if sheet_name in excel.sheet_names else excel.sheet_names[0]
        df = pd.read_excel(file_path, sheet_name=selected_sheet)

    cleaned_df, _ = clean_dataframe(df)
    return cleaned_df


def _get_machine_aggregate(file_path, sheet_name=None):
    df = load_dataset_frame(file_path, sheet_name)

    if df.empty:
        return df, None, []

    machine_column = detect_machine_column(df.columns.tolist())

    numeric_map = {}
    numeric_columns = []

    for col in df.columns:
        if col == machine_column:
            continue

        converted = pd.to_numeric(df[col], errors="coerce")
        if converted.notna().sum() > 0:
            numeric_map[col] = converted
            numeric_columns.append(col)

    if not numeric_columns:
        return pd.DataFrame(columns=[machine_column]), machine_column, []

    work_df = pd.DataFrame(numeric_map)
    work_df.insert(0, machine_column, df[machine_column].astype(str).str.strip())
    work_df = work_df[work_df[machine_column] != ""]
    work_df = work_df.dropna(subset=numeric_columns, how="all")

    if work_df.empty:
        return pd.DataFrame(columns=[machine_column] + numeric_columns), machine_column, numeric_columns

    aggregated = (
        work_df.groupby(machine_column, as_index=False)[numeric_columns]
        .mean()
        .sort_values(by=machine_column, key=lambda series: series.map(_machine_sort_key))
        .reset_index(drop=True)
    )

    return aggregated, machine_column, numeric_columns


def analyze_dataset(file_path):
    df = load_dataset_frame(file_path)

    return {
        "rows": int(len(df)),
        "columns": int(len(df.columns)),
        "column_names": df.columns.tolist()
    }


def analyze_excel(file_path):
    df = load_dataset_frame(file_path)

    numeric_columns = df.select_dtypes(include=["int64", "float64", "int32", "float32"]).columns.tolist()
    insights = {}

    for col in numeric_columns:
        insights[col] = {
            "mean": _safe_float(df[col].mean()),
            "sum": _safe_float(df[col].sum()),
            "max": _safe_float(df[col].max()),
            "min": _safe_float(df[col].min())
        }

    return insights


def detect_anomalies(file_path, parameter, sheet_name=None):
    aggregated, machine_column, numeric_columns = _get_machine_aggregate(file_path, sheet_name)

    if aggregated.empty or machine_column is None:
        return {
            "machine_column": None,
            "parameter": str(parameter),
            "results": [],
            "summary": {
                "total": 0,
                "anomalies": 0,
                "machines": []
            }
        }

    if parameter not in numeric_columns:
        raise ValueError(f"Column '{parameter}' not found in numeric dataset")

    working_df = aggregated[[machine_column, parameter]].copy().dropna(subset=[parameter])

    if working_df.empty:
        raise ValueError(f"No numeric data found for column '{parameter}'")

    if len(working_df) < 3:
        results = []
        for _, row in working_df.iterrows():
            results.append({
                "machine": str(row[machine_column]),
                "value": _safe_float(row[parameter]),
                "is_anomaly": False,
                "score": 0.0
            })

        return {
            "machine_column": str(machine_column),
            "parameter": str(parameter),
            "results": results,
            "summary": {
                "total": int(len(results)),
                "anomalies": 0,
                "machines": []
            }
        }

    contamination = min(0.2, max(0.05, 1 / len(working_df)))
    model = IsolationForest(contamination=contamination, random_state=42)

    values = working_df[[parameter]]
    predictions = model.fit_predict(values)
    scores = model.decision_function(values)

    results = []
    anomaly_machines = []

    for idx, (_, row) in enumerate(working_df.iterrows()):
        machine = str(row[machine_column])
        is_anomaly = bool(predictions[idx] == -1)

        if is_anomaly:
            anomaly_machines.append(machine)

        results.append({
            "machine": machine,
            "value": _safe_float(row[parameter]),
            "is_anomaly": is_anomaly,
            "score": _safe_float(scores[idx])
        })

    return {
        "machine_column": str(machine_column),
        "parameter": str(parameter),
        "results": results,
        "summary": {
            "total": int(len(results)),
            "anomalies": int(len(anomaly_machines)),
            "machines": anomaly_machines
        }
    }


def compute_health_scores(file_path, sheet_name=None):
    df = load_dataset_frame(file_path, sheet_name)

    if df.empty:
        return {
            "machine_column": None,
            "results": [],
            "summary": {
                "average_score": 0.0,
                "best_machine": None,
                "worst_machine": None
            }
        }

    machine_column = detect_machine_column(df.columns.tolist())
    shift_column = detect_shift_column(df.columns.tolist())

    if not shift_column:
        raise ValueError("Shift column not found in dataset")

    df[shift_column] = df[shift_column].apply(normalize_shift)

    numeric_columns = []
    for col in df.columns:
        if col not in [machine_column, shift_column]:
            converted = pd.to_numeric(df[col], errors="coerce")
            if converted.notna().sum() > 0:
                df[col] = converted
                numeric_columns.append(col)

    if not numeric_columns:
        return {
            "machine_column": machine_column,
            "shift_column": shift_column,
            "results": [],
            "summary": {
                "average_score": 0.0,
                "best_machine": None,
                "worst_machine": None
            }
        }

    grouped = (
        df.groupby([machine_column, shift_column])[numeric_columns]
        .mean()
        .reset_index()
    )

    values = grouped[numeric_columns].copy()

    means = values.mean()
    stds = values.std(ddof=0).replace(0, 1)
    z_scores = ((values - means) / stds).abs().clip(upper=4)

    anomaly_flags = np.zeros(len(grouped), dtype=int)
    if len(grouped) >= 3:
        contamination = min(0.2, max(0.05, 1 / len(grouped)))
        model = IsolationForest(contamination=contamination, random_state=42)
        anomaly_flags = (model.fit_predict(values) == -1).astype(int)

    base_score = 100 - (z_scores.mean(axis=1) * 22) - (anomaly_flags * 10)
    health_scores = base_score.clip(lower=0, upper=100)

    results = []
    for index, row in grouped.iterrows():
        score = _safe_float(health_scores.iloc[index])
        machine = str(row[machine_column])
        shift = normalize_shift(row[shift_column])

        if score >= 75:
            label = "Healthy"
        elif score >= 50:
            label = "Warning"
        else:
            label = "Critical"

        results.append({
            "machine": machine,
            "shift": shift,
            "display_label": f"Machine {machine} - Shift {shift}",
            "score": round(score, 2),
            "label": label,
            "is_anomaly": bool(anomaly_flags[index])
        })

    results.sort(
        key=lambda item: (
            _machine_sort_key(item["machine"]),
            ["E", "L", "N"].index(item["shift"]) if item["shift"] in ["E", "L", "N"] else 99
        )
    )

    average_score = round(sum(item["score"] for item in results) / len(results), 2) if results else 0.0
    best_machine = max(results, key=lambda item: item["score"]) if results else None
    worst_machine = min(results, key=lambda item: item["score"]) if results else None

    return {
        "machine_column": str(machine_column),
        "shift_column": str(shift_column),
        "results": results,
        "summary": {
            "average_score": average_score,
            "best_machine": best_machine,
            "worst_machine": worst_machine
        }
    }


def classify_failures(file_path, sheet_name=None):
    health = compute_health_scores(file_path, sheet_name)
    aggregated, machine_column, numeric_columns = _get_machine_aggregate(file_path, sheet_name)

    if not health.get("results"):
        return {
            "machine_column": machine_column,
            "results": [],
            "summary": {
                "high_risk_count": 0,
                "medium_risk_count": 0,
                "low_risk_count": 0,
                "top_risk_machine": None
            }
        }

    anomaly_columns = []
    if numeric_columns:
        for col in numeric_columns[: min(3, len(numeric_columns))]:
            anomaly_columns.append(detect_anomalies(file_path, col, sheet_name))

    anomaly_hits = Counter()
    for anomaly_result in anomaly_columns:
        for machine in anomaly_result["summary"]["machines"]:
            anomaly_hits[str(machine)] += 1

    results = []
    for item in health["results"]:
        machine = str(item["machine"])
        shift = normalize_shift(item.get("shift", "Unknown"))

        score_penalty = 100 - item["score"]
        anomaly_penalty = anomaly_hits[machine] * 15
        failure_score = max(0, min(100, round(score_penalty + anomaly_penalty, 2)))

        if failure_score >= 65:
            failure_class = "High"
        elif failure_score >= 35:
            failure_class = "Medium"
        else:
            failure_class = "Low"

        results.append({
            "machine": machine,
            "shift": shift,
            "label": f"Machine {machine} - Shift {shift}",
            "failure_score": failure_score,
            "failure_class": failure_class
        })

    results.sort(key=lambda item: item["failure_score"], reverse=True)

    summary = {
        "high_risk_count": sum(1 for item in results if item["failure_class"] == "High"),
        "medium_risk_count": sum(1 for item in results if item["failure_class"] == "Medium"),
        "low_risk_count": sum(1 for item in results if item["failure_class"] == "Low"),
        "top_risk_machine": results[0] if results else None
    }

    return {
        "machine_column": str(machine_column),
        "results": results,
        "summary": summary
    }


def suggest_chart(file_path, parameter=None, sheet_name=None):
    aggregated, _, numeric_columns = _get_machine_aggregate(file_path, sheet_name)
    machine_count = len(aggregated)

    if parameter and machine_count <= 8:
        recommended = "bar"
        reason = "Bar charts work best for comparing a small number of machines."
    elif parameter and machine_count > 8:
        recommended = "line"
        reason = "Line charts make large machine-by-machine comparisons easier to scan."
    elif len(numeric_columns) >= 3:
        recommended = "radar"
        reason = "Radar charts are useful for multi-parameter machine comparison."
    else:
        recommended = "scatter"
        reason = "Scatter charts help compare numeric patterns across machines."

    return {
        "recommended_chart": recommended,
        "reason": reason,
        "available": ["bar", "line", "pie", "scatter", "area", "composed", "radar"]
    }


def forecast_parameter(file_path, parameter, sheet_name=None, horizon=3):
    aggregated, machine_column, numeric_columns = _get_machine_aggregate(file_path, sheet_name)

    if aggregated.empty or parameter not in numeric_columns:
        return {
            "machine_column": machine_column,
            "parameter": str(parameter),
            "points": [],
            "predicted_next": None,
            "trend": "flat",
            "note": "Forecasting uses a simple sequence-based heuristic."
        }

    work_df = aggregated[[machine_column, parameter]].dropna(subset=[parameter]).copy()

    if len(work_df) == 0:
        return {
            "machine_column": str(machine_column),
            "parameter": str(parameter),
            "points": [],
            "predicted_next": None,
            "trend": "flat",
            "note": "Forecasting uses a simple sequence-based heuristic."
        }

    work_df = work_df.sort_values(
        by=machine_column,
        key=lambda series: series.map(_machine_sort_key)
    ).reset_index(drop=True)

    x_values = np.arange(len(work_df)).reshape(-1, 1)
    y_values = work_df[parameter].astype(float).values

    model = LinearRegression()
    model.fit(x_values, y_values)

    points = []
    for idx, row in work_df.iterrows():
        predicted = _safe_float(model.predict([[idx]])[0])
        points.append({
            "label": str(row[machine_column]),
            "actual": _safe_float(row[parameter]),
            "predicted": predicted,
            "is_forecast": False
        })

    future_points = []
    for step in range(1, int(horizon) + 1):
        future_index = len(work_df) + step - 1
        predicted = _safe_float(model.predict([[future_index]])[0])
        label = f"Forecast {step}"
        future_points.append({
            "label": label,
            "actual": None,
            "predicted": predicted,
            "is_forecast": True
        })

    slope = _safe_float(model.coef_[0])
    trend = "upward" if slope > 0.01 else "downward" if slope < -0.01 else "flat"

    return {
        "machine_column": str(machine_column),
        "parameter": str(parameter),
        "points": points + future_points,
        "predicted_next": future_points[0]["predicted"] if future_points else None,
        "trend": trend,
        "note": "Forecasting uses a simple sequence-based heuristic based on machine order."
    }


def generate_ai_summary(file_path, parameter=None, sheet_name=None):
    aggregated, _, numeric_columns = _get_machine_aggregate(file_path, sheet_name)

    if aggregated.empty or not numeric_columns:
        return {
            "summary": [
                "No machine-level numeric data was available for AI insights."
            ]
        }

    selected_parameter = parameter if parameter in numeric_columns else numeric_columns[0]
    anomalies = detect_anomalies(file_path, selected_parameter, sheet_name)
    health = compute_health_scores(file_path, sheet_name)
    failures = classify_failures(file_path, sheet_name)
    suggestion = suggest_chart(file_path, selected_parameter, sheet_name)

    lines = []

    if health["summary"]["best_machine"] and health["summary"]["worst_machine"]:
        best_machine = health["summary"]["best_machine"]
        worst_machine = health["summary"]["worst_machine"]
        lines.append(
            f"Machine {best_machine['machine']} in shift {best_machine['shift']} has the strongest health score at {best_machine['score']}, while machine {worst_machine['machine']} in shift {worst_machine['shift']} is the weakest at {worst_machine['score']}."
        )

    if anomalies["summary"]["anomalies"] > 0:
        machines_text = ", ".join(anomalies["summary"]["machines"])
        lines.append(
            f"For {selected_parameter}, anomaly detection flagged {anomalies['summary']['anomalies']} machine samples: {machines_text}."
        )
    else:
        lines.append(
            f"For {selected_parameter}, anomaly detection did not flag any machine as abnormal."
        )

    if failures["summary"]["top_risk_machine"]:
        top_machine = failures["summary"]["top_risk_machine"]
        lines.append(
            f"Machine {top_machine['machine']} in shift {top_machine['shift']} has the highest failure score at {top_machine['failure_score']} and is classified as {top_machine['failure_class']} risk."
        )

    lines.append(
        f"The recommended chart for the current view is {suggestion['recommended_chart']}, because {suggestion['reason'].lower()}"
    )

    return {
        "summary": lines
    }


def save_insights(db, file_id, insights):
    for column, stats in insights.items():
        insight = Insight(
            file_id=file_id,
            column_name=column,
            stats=stats
        )
        db.add(insight)

    db.commit()
