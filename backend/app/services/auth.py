from fastapi import Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.user import User
from ..utils.security import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def _token_from_request(request: Request, header_token: str | None) -> str | None:
    return request.cookies.get("servicuba_access") or header_token


def _user_from_token(token: str | None, db: Session) -> User:
    if not token:
        raise HTTPException(status_code=401, detail="No autenticado")
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Token inválido")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if getattr(user, "suspendido", False):
        raise HTTPException(status_code=403, detail="Cuenta suspendida")
    return user


def get_current_user(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    return _user_from_token(_token_from_request(request, token), db)


def get_optional_current_user(
    request: Request,
    token: str | None = Depends(oauth2_scheme_optional),
    db: Session = Depends(get_db),
):
    effective_token = _token_from_request(request, token)
    if not effective_token:
        return None
    return _user_from_token(effective_token, db)


def get_current_admin(current_user: User = Depends(get_current_user)):
    if not current_user.es_admin:
        raise HTTPException(status_code=403, detail="Requiere permisos de administrador")
    return current_user
