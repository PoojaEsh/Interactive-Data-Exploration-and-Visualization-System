import os
import time
import uuid

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database import get_db
from app.models.uploaded_file import UploadedFile
from app.models.user import User
from app.services.analyzer import (
    classify_failures,
    compute_health_scores,
    detect_anomalies,
    forecast_parameter,
    generate_ai_summary,
    suggest_chart,
)

router = APIRouter(prefix="/datasets", tags=["Datasets"])

UPLOAD_FOLDER = "uploads"

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)


def get_user_dataset_or_404(dataset_id, db, current_user):
    try:
        parsed_id = uuid.UUID(dataset_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid dataset id")

    dataset = db.query(UploadedFile).filter(
        UploadedFile.id == parsed_id,
        UploadedFile.user_id == current_user.id
    ).first()

    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    return dataset


def clean_dataframe(df: pd.DataFrame):
    report = {
        "missing_before": {},
        "filled_columns": {},
        "outliers_capped": {}
    }

    cleaned = df.copy()

    cleaned = cleaned.dropna(axis=1, how="all")
    cleaned = cleaned.loc[:, ~cleaned.columns.astype(str).str.contains("^Unnamed", na=False)]
    cleaned.columns = [str(col).strip() for col in cleaned.columns]

    for col in cleaned.columns:
        report["missing_before"][col] = int(cleaned[col].isna().sum())

    for col in cleaned.columns:
        if pd.api.types.is_numeric_dtype(cleaned[col]):
            missing_count = int(cleaned[col].isna().sum())
            if missing_count > 0:
                median_value = cleaned[col].median()
                cleaned[col] = cleaned[col].fillna(median_value)
                report["filled_columns"][col] = {
                    "method": "median",
                    "filled_count": missing_count,
                    "value_used": None if pd.isna(median_value) else float(median_value)
                }
        else:
            missing_count = int(cleaned[col].isna().sum())
            if missing_count > 0:
                mode_series = cleaned[col].mode(dropna=True)
                mode_value = mode_series.iloc[0] if not mode_series.empty else "Unknown"
                cleaned[col] = cleaned[col].fillna(mode_value)
                report["filled_columns"][col] = {
                    "method": "mode",
                    "filled_count": missing_count,
                    "value_used": str(mode_value)
                }

    for col in cleaned.select_dtypes(include=[np.number]).columns:
        q1 = cleaned[col].quantile(0.25)
        q3 = cleaned[col].quantile(0.75)
        iqr = q3 - q1

        if pd.isna(iqr) or iqr == 0:
            continue

        lower = q1 - 1.5 * iqr
        upper = q3 + 1.5 * iqr

        before = cleaned[col].copy()
        cleaned[col] = cleaned[col].clip(lower=lower, upper=upper)

        capped_count = int((before != cleaned[col]).sum())
        if capped_count > 0:
            report["outliers_capped"][col] = {
                "count": capped_count,
                "lower_bound": float(lower),
                "upper_bound": float(upper)
            }

    cleaned = cleaned.replace({np.nan: ""})

    return cleaned, report


@router.get("/")
def get_datasets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    datasets = db.query(UploadedFile).filter(
        UploadedFile.user_id == current_user.id
    ).all()

    result = []
    for file in datasets:
        result.append({
            "id": str(file.id),
            "filename": file.filename,
            "filepath": file.filepath,
            "upload_time": file.upload_time
        })

    return result


@router.post("/upload")
def upload_dataset(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    file_id = uuid.uuid4()
    file_path = os.path.join(UPLOAD_FOLDER, f"{file_id}_{file.filename}")

    with open(file_path, "wb") as buffer:
        buffer.write(file.file.read())

    dataset = UploadedFile(
        id=file_id,
        filename=file.filename,
        filepath=file_path,
        user_id=current_user.id
    )

    db.add(dataset)
    db.commit()
    db.refresh(dataset)

    return {
        "id": str(dataset.id),
        "filename": dataset.filename,
        "filepath": dataset.filepath,
        "upload_time": dataset.upload_time
    }


@router.get("/{dataset_id}/sheets")
def get_sheets(
    dataset_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    dataset = get_user_dataset_or_404(dataset_id, db, current_user)

    if dataset.filepath.endswith(".csv"):
        return {"sheets": ["CSV Data"]}

    try:
        excel = pd.ExcelFile(dataset.filepath)
        sheets = excel.sheet_names
        excel.close()
    except Exception:
        raise HTTPException(status_code=500, detail="Unable to read Excel sheets")

    return {"sheets": sheets}


@router.get("/{dataset_id}/data")
def get_sheet_data(
    dataset_id: str,
    sheet_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    dataset = get_user_dataset_or_404(dataset_id, db, current_user)

    try:
        if dataset.filepath.endswith(".csv"):
            df = pd.read_csv(dataset.filepath)
        else:
            df = pd.read_excel(dataset.filepath, sheet_name=sheet_name)
    except Exception:
        raise HTTPException(status_code=500, detail="Error reading dataset")

    cleaned_df, cleaning_report = clean_dataframe(df)

    return {
        "data": cleaned_df.to_dict(orient="records"),
        "cleaning_report": cleaning_report
    }


@router.get("/{dataset_id}/anomaly")
def get_dataset_anomalies(
    dataset_id: str,
    parameter: str,
    sheet_name: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    dataset = get_user_dataset_or_404(dataset_id, db, current_user)

    try:
        return detect_anomalies(
            file_path=dataset.filepath,
            parameter=parameter,
            sheet_name=sheet_name
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))


@router.get("/{dataset_id}/health-score")
def get_health_scores(
    dataset_id: str,
    sheet_name: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    dataset = get_user_dataset_or_404(dataset_id, db, current_user)

    try:
        return compute_health_scores(dataset.filepath, sheet_name)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))


@router.get("/{dataset_id}/failure-classification")
def get_failure_classification(
    dataset_id: str,
    sheet_name: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    dataset = get_user_dataset_or_404(dataset_id, db, current_user)

    try:
        return classify_failures(dataset.filepath, sheet_name)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))


@router.get("/{dataset_id}/summary")
def get_ai_summary(
    dataset_id: str,
    parameter: str = None,
    sheet_name: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    dataset = get_user_dataset_or_404(dataset_id, db, current_user)

    try:
        return generate_ai_summary(dataset.filepath, parameter, sheet_name)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))


@router.get("/{dataset_id}/chart-suggestion")
def get_chart_suggestion(
    dataset_id: str,
    parameter: str = None,
    sheet_name: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    dataset = get_user_dataset_or_404(dataset_id, db, current_user)

    try:
        return suggest_chart(dataset.filepath, parameter, sheet_name)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))


@router.get("/{dataset_id}/forecast")
def get_forecast(
    dataset_id: str,
    parameter: str,
    sheet_name: str = None,
    horizon: int = 3,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    dataset = get_user_dataset_or_404(dataset_id, db, current_user)

    try:
        return forecast_parameter(dataset.filepath, parameter, sheet_name, horizon)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))


@router.delete("/{dataset_id}")
def delete_dataset(
    dataset_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    dataset = get_user_dataset_or_404(dataset_id, db, current_user)

    if os.path.exists(dataset.filepath):
        try:
            time.sleep(0.5)
            os.remove(dataset.filepath)
        except PermissionError:
            raise HTTPException(
                status_code=400,
                detail="File is currently in use. Close Excel file and try again."
            )

    db.delete(dataset)
    db.commit()

    return {"message": "Dataset deleted successfully"}
