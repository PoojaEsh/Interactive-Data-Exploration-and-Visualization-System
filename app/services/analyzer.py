import pandas as pd
from app.models.insight import Insight


def get_excel_sheets(file_path):
    excel_file = pd.ExcelFile(file_path)
    return excel_file.sheet_names


# =========================
# BASIC DATASET ANALYSIS
# =========================
def analyze_dataset(file_path):
    """
    Basic dataset analysis used by existing dashboard
    """

    if file_path.endswith(".csv"):
        df = pd.read_csv(file_path)
    else:
        df = pd.read_excel(file_path)

    result = {
        "rows": len(df),
        "columns": len(df.columns),
        "column_names": df.columns.tolist()
    }

    return result


# =========================
# EXCEL INSIGHT GENERATOR
# =========================
def analyze_excel(file_path):
    """
    Generate statistical insights from numeric columns
    """

    if file_path.endswith(".csv"):
        df = pd.read_csv(file_path)
    else:
        df = pd.read_excel(file_path)

    numeric_columns = df.select_dtypes(include=["int64", "float64"]).columns.tolist()

    insights = {}

    for col in numeric_columns:

        insights[col] = {
            "mean": float(df[col].mean()),
            "sum": float(df[col].sum()),
            "max": float(df[col].max()),
            "min": float(df[col].min())
        }

    return insights


# =========================
# SAVE INSIGHTS TO DATABASE
# =========================
def save_insights(db, file_id, insights):

    for column, stats in insights.items():

        insight = Insight(
            file_id=file_id,
            column_name=column,
            stats=stats
        )

        db.add(insight)

    db.commit()