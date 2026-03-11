from passlib.context import CryptContext
import hashlib

print(">>> SECURITY MODULE LOADED <<<")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    print(">>> USING SHA256 BEFORE BCRYPT <<<")
    sha_password = hashlib.sha256(password.encode()).hexdigest()
    return pwd_context.hash(sha_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    print(">>> VERIFY USING SHA256 BEFORE BCRYPT <<<")
    sha_password = hashlib.sha256(plain_password.encode()).hexdigest()
    return pwd_context.verify(sha_password, hashed_password)