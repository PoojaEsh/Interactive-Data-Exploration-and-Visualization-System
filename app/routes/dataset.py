from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
import os
import uuid
import pandas as pd
import time

from app.database import get_db
from app.models.uploaded_file import UploadedFile
from app.models.user import User
from app.core.security import get_current_user

router = APIRouter(prefix="/datasets", tags=["Datasets"])

UPLOAD_FOLDER = "uploads"

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)


# =========================
# GET ALL DATASETS
# =========================

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


# =========================
# UPLOAD DATASET
# =========================

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


# =========================
# GET EXCEL SHEETS
# =========================

@router.get("/{dataset_id}/sheets")
def get_sheets(
    dataset_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    dataset = db.query(UploadedFile).filter(
        UploadedFile.id == uuid.UUID(dataset_id),
        UploadedFile.user_id == current_user.id
    ).first()

    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # CSV files only have one sheet
    if dataset.filepath.endswith(".csv"):
        return {"sheets": ["CSV Data"]}

    try:
        excel = pd.ExcelFile(dataset.filepath)
        sheets = excel.sheet_names
        excel.close()
    except Exception:
        raise HTTPException(status_code=500, detail="Unable to read Excel sheets")

    return {"sheets": sheets}


# =========================
# GET SHEET DATA
# =========================

@router.get("/{dataset_id}/data")
def get_sheet_data(
    dataset_id: str,
    sheet_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    dataset = db.query(UploadedFile).filter(
        UploadedFile.id == uuid.UUID(dataset_id),
        UploadedFile.user_id == current_user.id
    ).first()

    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    try:
        if dataset.filepath.endswith(".csv"):
            df = pd.read_csv(dataset.filepath)
        else:
            df = pd.read_excel(dataset.filepath, sheet_name=sheet_name)

    except Exception:
        raise HTTPException(status_code=500, detail="Error reading dataset")

    # =========================
    # CLEAN DATA
    # =========================

    df = df.dropna(axis=1, how="all")

    df = df.loc[:, ~df.columns.str.contains("^Unnamed")]

    df.columns = [str(col).strip() for col in df.columns]

    df = df.fillna("")

    return {
        "data": df.to_dict(orient="records")
    }


# =========================
# DELETE DATASET
# =========================

@router.delete("/{dataset_id}")
def delete_dataset(
    dataset_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    dataset = db.query(UploadedFile).filter(
        UploadedFile.id == uuid.UUID(dataset_id),
        UploadedFile.user_id == current_user.id
    ).first()

    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # SAFE FILE DELETE
    if os.path.exists(dataset.filepath):
        try:
            time.sleep(0.5)  # wait for file lock release
            os.remove(dataset.filepath)
        except PermissionError:
            raise HTTPException(
                status_code=400,
                detail="File is currently in use. Close Excel file and try again."
            )

    db.delete(dataset)
    db.commit()

    return {"message": "Dataset deleted successfully"}