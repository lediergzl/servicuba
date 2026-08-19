"""Production baseline for the existing ServiCuba schema.

Revision ID: 20260819_01
Revises:
"""
from alembic import op

from app.database import Base

revision = "20260819_01"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    # Create any tables missing from an existing installation before applying
    # additive compatibility changes below. This migration is intentionally
    # idempotent so an existing production database can be adopted safely.
    Base.metadata.create_all(bind=bind)

    op.execute("ALTER TABLE users ALTER COLUMN rol DROP NOT NULL")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS suspendido BOOLEAN NOT NULL DEFAULT false")
    op.execute("CREATE INDEX IF NOT EXISTS idx_users_suspendido ON users (suspendido)")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS codigo_verificacion VARCHAR(255)")
    op.execute("ALTER TABLE users ALTER COLUMN codigo_verificacion TYPE VARCHAR(255)")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS codigo_verificacion_expira TIMESTAMP")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS plan VARCHAR(20) NOT NULL DEFAULT 'GRATIS'")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expira TIMESTAMP")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS es_admin BOOLEAN NOT NULL DEFAULT false")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS es_cliente BOOLEAN NOT NULL DEFAULT true")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS es_trabajador BOOLEAN NOT NULL DEFAULT false")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS modo_activo VARCHAR(20) NOT NULL DEFAULT 'cliente'")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS categoria_id INTEGER REFERENCES categories(id)")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS descripcion_trabajador TEXT")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS precio_hora DOUBLE PRECISION")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS ubicacion geometry(POINT, 4326)")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS municipio VARCHAR(100)")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS zona VARCHAR(100)")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS foto VARCHAR(255)")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS rating DOUBLE PRECISION DEFAULT 0.0")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS verificado BOOLEAN DEFAULT false")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS codigo_reset_password VARCHAR(255)")
    op.execute("ALTER TABLE users ALTER COLUMN codigo_reset_password TYPE VARCHAR(255)")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS codigo_reset_password_expira TIMESTAMP")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS login_failed_attempts INTEGER NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS login_locked_until TIMESTAMP")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS login_last_failed_at TIMESTAMP")

    op.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS destacada BOOLEAN NOT NULL DEFAULT false")
    op.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS destacada_hasta TIMESTAMP")
    op.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) NOT NULL DEFAULT 'necesidad'")
    op.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS fotos TEXT")
    op.execute("ALTER TYPE taskstatus ADD VALUE IF NOT EXISTS 'CONFIRMADA'")
    op.execute("ALTER TYPE paymentstatus ADD VALUE IF NOT EXISTS 'REEMBOLSADO'")
    op.execute("ALTER TABLE payments ADD COLUMN IF NOT EXISTS entitlement_expires_at TIMESTAMP")

    op.execute("ALTER TABLE reviews ADD COLUMN IF NOT EXISTS calidad_trabajo INTEGER")
    op.execute("ALTER TABLE reviews ADD COLUMN IF NOT EXISTS trato INTEGER")
    op.execute("ALTER TABLE reviews ADD COLUMN IF NOT EXISTS puntualidad INTEGER")
    op.execute("ALTER TABLE reviews ADD COLUMN IF NOT EXISTS precio_acordado INTEGER")
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_reviews_calidad') THEN
                ALTER TABLE reviews ADD CONSTRAINT ck_reviews_calidad
                    CHECK (calidad_trabajo IS NULL OR calidad_trabajo BETWEEN 1 AND 5);
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_reviews_trato') THEN
                ALTER TABLE reviews ADD CONSTRAINT ck_reviews_trato
                    CHECK (trato IS NULL OR trato BETWEEN 1 AND 5);
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_reviews_puntualidad') THEN
                ALTER TABLE reviews ADD CONSTRAINT ck_reviews_puntualidad
                    CHECK (puntualidad IS NULL OR puntualidad BETWEEN 1 AND 5);
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_reviews_precio') THEN
                ALTER TABLE reviews ADD CONSTRAINT ck_reviews_precio
                    CHECK (precio_acordado IS NULL OR precio_acordado BETWEEN 1 AND 5);
            END IF;
        END $$;
    """)

    op.execute("CREATE INDEX IF NOT EXISTS idx_tasks_ubicacion_geog ON tasks USING GIST ((ubicacion::geography))")
    op.execute("CREATE INDEX IF NOT EXISTS idx_tasks_estado_categoria ON tasks (estado, categoria_id)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_applications_task_worker ON applications (task_id, worker_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_applications_task_status ON applications (task_id, estado)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_applications_worker_created ON applications (worker_id, created_at)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_task ON reviews (task_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_reviews_worker ON reviews (trabajador_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_reviews_client ON reviews (cliente_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_native_push_tokens_user ON native_push_tokens (user_id)")


def downgrade() -> None:
    # This is a baseline adoption migration for a live database. Destructive
    # rollback is intentionally not automatic; future migrations should provide
    # precise reversible operations from this baseline.
    raise RuntimeError("The production baseline migration is not reversible")
