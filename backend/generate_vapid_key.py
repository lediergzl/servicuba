"""
Genera un par de claves VAPID e imprime la clave privada en formato PEM.

Uso: en Render (y cualquier plataforma con disco efímero) el archivo
.vapid/private_key.pem que la app genera automáticamente NO sobrevive a un
redeploy — cada redeploy generaría una clave nueva e invalidaría todas las
suscripciones push que los navegadores ya guardaron.

Para evitarlo: correr este script UNA VEZ en local, y pegar la salida
completa (incluyendo -----BEGIN/END-----) en la variable de entorno
VAPID_PRIVATE_KEY_PEM del servicio en Render. La app la usará en vez de
generar una nueva (ver app/utils/vapid_keys.py).

    python backend/generate_vapid_key.py
"""
from py_vapid import Vapid
import tempfile
from pathlib import Path

if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "key.pem"
        vapid = Vapid()
        vapid.generate_keys()
        vapid.save_key(str(path))
        pem = path.read_text()

    print("Copia TODO el bloque de abajo (incluyendo BEGIN/END) en la")
    print("variable de entorno VAPID_PRIVATE_KEY_PEM en Render:\n")
    print(pem)
