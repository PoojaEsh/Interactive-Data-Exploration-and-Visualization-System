from fastapi import APIRouter, UploadFile, File, Query, HTTPException
import pandas as pd
import io
import os

router = APIRouter(prefix="/files", tags=["Files"])

UPLOAD_FOLDER = "uploads"



# -----------------------------
# Analyze Dataset (CSV or Excel)
# -----------------------------
@router.post("/analyze")
async def analyze_dataset(file: UploadFile = File(...)):

    filename = file.filename.lower()

    # ---------- CSV ----------
    if filename.endswith(".csv"):

        df = pd.read_csv(file.file, encoding="latin1")

        df = df.dropna(how="all")
        df = df.dropna(axis=1, how="all")
        df = df.fillna("")
        df = df.reset_index(drop=True)

        columns = []

        for col in df.columns:

            dtype = str(df[col].dtype)

            if "int" in dtype or "float" in dtype:
                col_type = "numeric"
            elif "object" in dtype:
                col_type = "category"
            else:
                col_type = "other"

            columns.append({
                "name": col,
                "type": col_type
            })

        return {
            "columns": columns,
            "preview": df.head(20).to_dict(orient="records")
        }


    # ---------- EXCEL ----------
    elif filename.endswith(".xlsx") or filename.endswith(".xls"):

        contents = await file.read()
        file_stream = io.BytesIO(contents)

        excel = pd.ExcelFile(file_stream)

        sheet_names = excel.sheet_names

        df = pd.read_excel(excel, sheet_name=sheet_names[0])

        df = df.dropna(how="all")
        df = df.dropna(axis=1, how="all")
        df = df.fillna("")
        df = df.reset_index(drop=True)

        columns = []

        for col in df.columns:

            dtype = str(df[col].dtype)

            if "int" in dtype or "float" in dtype:
                col_type = "numeric"
            elif "object" in dtype:
                col_type = "category"
            else:
                col_type = "other"

            columns.append({
                "name": col,
                "type": col_type
            })

        return {
            "sheets": sheet_names,
            "columns": columns,
            "preview": df.head(20).to_dict(orient="records")
        }

    else:
        return {"error": "Unsupported file type"}



# -----------------------------
# Get Sheet Names
# -----------------------------
@router.get("/{file_id}/sheets")
async def get_sheets(file_id: str):

    file_path = None

    for f in os.listdir(UPLOAD_FOLDER):
        if file_id in f:
            file_path = os.path.join(UPLOAD_FOLDER, f)
            break

    if not file_path:
        raise HTTPException(status_code=404, detail="File not found")

    excel = pd.ExcelFile(file_path)

    return {"sheets": excel.sheet_names}



# -----------------------------
# Fetch Specific Sheet
# -----------------------------
@router.get("/{file_id}/preview")
async def preview_sheet(file_id: str, sheet_name: str = Query(...)):

    file_path = None

    for f in os.listdir(UPLOAD_FOLDER):
        if file_id in f:
            file_path = os.path.join(UPLOAD_FOLDER, f)
            break

    if not file_path:
        raise HTTPException(status_code=404, detail="File not found")

    excel = pd.ExcelFile(file_path)

    if sheet_name not in excel.sheet_names:
        raise HTTPException(status_code=404, detail="Sheet not found")

    df = excel.parse(sheet_name)

    df = df.dropna(how="all")
    df = df.dropna(axis=1, how="all")
    df = df.fillna("")
    df = df.reset_index(drop=True)

    columns = list(df.columns)
    rows = df.head(50).to_dict(orient="records")

    return {
        "columns": columns,
        "data": rows
    }



# -----------------------------
# DELETE FILE (FIXED)
# -----------------------------
@router.delete("/{file_id}")
async def delete_file(file_id: str):

    file_path = None

    for f in os.listdir(UPLOAD_FOLDER):
        if file_id in f:
            file_path = os.path.join(UPLOAD_FOLDER, f)
            break

    if not file_path:
        raise HTTPException(status_code=404, detail="File not found")

    os.remove(file_path)

    return {"message": "File deleted successfully"}