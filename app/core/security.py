from datetime import datetime, timedelta
import hashlib
import os
import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User

SECRET_KEY = os.getenv("SECRET_KEY", "CHANGE_THIS_TO_RANDOM_LONG_SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def _prepare_password_sha256(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def hash_password(password: str) -> str:
    return pwd_context.hash(_prepare_password_sha256(password))


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        if pwd_context.verify(_prepare_password_sha256(plain_password), hashed_password):
            return True
    except Exception:
        pass

    try:
        if pwd_context.verify(plain_password, hashed_password):
            return True
    except Exception:
        pass

    return False


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({
        "exp": expire,
        "iat": datetime.utcnow()
    })
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")

        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = None

    try:
        user = db.query(User).filter(User.id == int(user_id)).first()
    except Exception:
        pass

    if user is None:
        try:
            user = db.query(User).filter(User.id == uuid.UUID(user_id)).first()
        except Exception:
            pass

    if user is None:
        try:
            user = db.query(User).filter(User.id == user_id).first()
        except Exception:
            pass

    if user is None:
        raise credentials_exception

    return user
