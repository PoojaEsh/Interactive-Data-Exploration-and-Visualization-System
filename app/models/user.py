import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, Integer
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True
    )

    email = Column(
        String,
        unique=True,
        nullable=False,
        index=True
    )

    hashed_password = Column(
        String,
        nullable=False
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )

    # ===== LOGIN SECURITY =====

    failed_attempts = Column(
        Integer,
        default=0
    )

    lock_until = Column(
        DateTime,
        nullable=True
    )

    # ===== PASSWORD RESET =====

    reset_token = Column(
        String,
        nullable=True
    )

    reset_token_expiry = Column(
        DateTime,
        nullable=True
    )