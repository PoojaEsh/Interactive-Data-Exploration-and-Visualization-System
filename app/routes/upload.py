from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
import os
import pandas as pd
import math
from uuid import UUID, uuid4

from app.database import get_db
from app.models.uploaded_file import UploadedFile
from app.models.user import User
from app.models.analysis_result import AnalysisResult
from app.models.insight import Insight
from app.core.security import get_current_user
from app.services.analyzer import (
    analyze_dataset,
    analyze_excel,
    save_insights,
    get_excel_sheets,
    load_dataset_frame,
    detect_anomalies,
)

router = APIRouter(prefix="/files", tags=["Files"])

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


# =========================
# UPLOAD FILE
# =========================
@router.post("/upload")
def upload_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    unique_filename = f"{uuid4()}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)

    with open(file_path, "wb") as buffer:
        buffer.write(file.file.read())

    try:
        analysis_result = analyze_dataset(file_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    db_file = UploadedFile(
        filename=file.filename,
        filepath=file_path,
        user_id=current_user.id
    )

    db.add(db_file)
    db.commit()
    db.refresh(db_file)

    analysis_entry = AnalysisResult(
        file_id=db_file.id,
        result=analysis_result
    )

    db.add(analysis_entry)
    db.commit()

    try:
        insights = analyze_excel(file_path)
        save_insights(db, db_file.id, insights)
    except Exception as e:
        print("Insight generation failed:", e)

    return {
        "message": "File uploaded and analyzed successfully",
        "file_id": db_file.id
    }


# =========================
# LIST FILES
# =========================
@router.get("/my-files")
def get_my_files(
    page: int = Query(1, ge=1),
    limit: int = Query(5, ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    offset = (page - 1) * limit

    total_files = db.query(UploadedFile).filter(
        UploadedFile.user_id == current_user.id
    ).count()

    files = db.query(UploadedFile).filter(
        UploadedFile.user_id == current_user.id
    ).offset(offset).limit(limit).all()

    return {
        "total": total_files,
        "page": page,
        "limit": limit,
        "files": [
            {
                "id": f.id,
                "filename": f.filename,
                "upload_time": f.upload_time
            }
            for f in files
        ]
    }


# =========================
# PREVIEW FILE (MULTI-SHEET SUPPORT)
# =========================
@router.get("/{file_id}/preview")
def preview_file(
    file_id: UUID,
    sheet: str = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    file = db.query(UploadedFile).filter(
        UploadedFile.id == file_id,
        UploadedFile.user_id == current_user.id
    ).first()

    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        df, sheets = load_dataset_frame(file.filepath, sheet)
        df = df.head(10)

        preview_data = df.to_dict(orient="records")

        for row in preview_data:
            for key, value in row.items():
                if isinstance(value, float) and math.isnan(value):
                    row[key] = None

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "sheets": sheets,
        "data": preview_data
    }

# =========================
# GET SHEETS ONLY
# =========================
@router.get("/{file_id}/sheets")
def get_sheets(
    file_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    file = db.query(UploadedFile).filter(
        UploadedFile.id == file_id,
        UploadedFile.user_id == current_user.id
    ).first()

    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    sheets = get_excel_sheets(file.filepath)

    return {
        "file_id": file_id,
        "sheets": sheets
    }

    
#anomaly route

 @router.get("/{file_id}/anomaly")
def get_file_anomalies(
    file_id: UUID,
    parameter: str = Query(...),
    sheet: str = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    file = db.query(UploadedFile).filter(
        UploadedFile.id == file_id,
        UploadedFile.user_id == current_user.id
    ).first()

    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        result = detect_anomalies(
            file_path=file.filepath,
            parameter=parameter,
            sheet_name=sheet
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
   


# =========================
# DOWNLOAD FILE
# =========================
@router.get("/{file_id}/download")
def download_file(
    file_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    file = db.query(UploadedFile).filter(
        UploadedFile.id == file_id,
        UploadedFile.user_id == current_user.id
    ).first()

    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    if not os.path.exists(file.filepath):
        raise HTTPException(status_code=404, detail="File missing on disk")

    return FileResponse(
        path=file.filepath,
        filename=file.filename,
        media_type="application/octet-stream"
    )


# =========================
# DELETE FILE
# =========================
@router.delete("/{file_id}")
def delete_file(
    file_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    file = db.query(UploadedFile).filter(
        UploadedFile.id == file_id,
        UploadedFile.user_id == current_user.id
    ).first()

    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    db.query(Insight).filter(Insight.file_id == file_id).delete()
    db.query(AnalysisResult).filter(AnalysisResult.file_id == file_id).delete()

    if os.path.exists(file.filepath):
        os.remove(file.filepath)

    db.delete(file)
    db.commit()

    return {"message": "File deleted successfully"}