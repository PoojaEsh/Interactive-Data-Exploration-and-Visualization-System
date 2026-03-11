from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from uuid import UUID

from app.database import get_db
from app.models.insight import Insight

router = APIRouter(prefix="/insights", tags=["Insights"])

@router.get("/{file_id}")
def get_insights(file_id: UUID, db: Session = Depends(get_db)):
    
    insights = db.query(Insight).filter(
        Insight.file_id == file_id
    ).all()

    return insights