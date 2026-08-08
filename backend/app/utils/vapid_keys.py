"""
Genera (una sola vez) y reutiliza el par de claves VAPID que Web Push
necesita para firmar los envíos. Si las claves cambiaran entre despliegues,
todas las suscripciones push existentes de los navegadores dejarían de ser
válidas — por eso se persisten en disco y solo se regeneran si el archivo
no existe.

En un despliegue con disco efímero (contenedores que se reconstruyen desde
cero en cada deploy), lo correcto es fijar VAPID_PRIVATE_KEY_PEM en una
variable de entorno persistente; si está presente, se usa esa en vez de
generar/leer el archivo.
"""
import base64
import os
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid

_DEFAULT_KEY_DIR = Path(__file__).resolve().parent.parent.parent / ".vapid"
_DEFAULT_KEY_PATH = _DEFAULT_KEY_DIR / "private_key.pem"


def get_or_create_vapid_key_path() -> Path:
    """Devuelve la ruta a un archivo .pem con la clave privada VAPID,
    generándola si todavía no existe. Si VAPID_PRIVATE_KEY_PEM está
    definida en el entorno, se vuelca a ese mismo archivo (permite
    inyectar la clave vía variable de entorno en plataformas con disco
    efímero)."""
    env_pem = os.getenv("VAPID_PRIVATE_KEY_PEM")
    _DEFAULT_KEY_DIR.mkdir(parents=True, exist_ok=True)

    if env_pem:
        _DEFAULT_KEY_PATH.write_text(env_pem)
        return _DEFAULT_KEY_PATH

    if not _DEFAULT_KEY_PATH.exists():
        vapid = Vapid()
        vapid.generate_keys()
        vapid.save_key(str(_DEFAULT_KEY_PATH))

    return _DEFAULT_KEY_PATH


def get_vapid_public_key_b64(key_path: Path) -> str:
    """Deriva la clave pública (formato urlsafe base64, sin padding) a
    partir del .pem privado — es lo que el frontend necesita para
    pushManager.subscribe({applicationServerKey: ...})."""
    vapid = Vapid.from_file(str(key_path))
    pub_bytes = vapid.public_key.public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )
    return base64.urlsafe_b64encode(pub_bytes).rstrip(b"=").decode()
