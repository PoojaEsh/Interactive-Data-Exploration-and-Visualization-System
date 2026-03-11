from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware


from app.database import engine, Base

# routers
from app.routes.auth import router as auth_router
from app.routes.upload import router as upload_router
from app.routes.dataset import router as dataset_router
from app.routes.insights import router as insights_router
from app.routes.files import router as files_router

# security
from app.core.security import get_current_user

# models
from app.models.user import User
from app.models.uploaded_file import UploadedFile
from app.models.analysis_result import AnalysisResult



# =========================
# CREATE FASTAPI APP
# =========================

app = FastAPI(
    title="Smart Dashboard API",
    version="1.0"
)


# =========================
# CORS CONFIGURATION
# =========================

origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================
# CREATE DATABASE TABLES
# =========================

Base.metadata.create_all(bind=engine)


# =========================
# INCLUDE ROUTERS
# =========================

app.include_router(auth_router)
app.include_router(upload_router)
app.include_router(dataset_router)
app.include_router(insights_router)
app.include_router(files_router)


# =========================
# ROOT ROUTE
# =========================

@app.get("/")
def root():
    return {"message": "Backend Running Successfully 🚀"}


# =========================
# TEST AUTH ROUTE
# =========================

@app.get("/users/me")
def read_current_user(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email
    }