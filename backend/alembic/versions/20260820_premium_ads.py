"""premium promotional ads

Revision ID: 20260820_premium_ads
Revises: 20260820_user_email
Create Date: 2026-08-20
"""
from alembic import op
import sqlalchemy as sa

revision = "20260820_premium_ads"
down_revision = "20260820_user_email"
branch_labels = None
depends_on = None


def upgrade():
    # Additive migration for premium promotional ads.
    # IF NOT EXISTS guards keep this safe for databases where a partial deploy
    # already created one or more columns/indexes before a restart.
    op.execute('ALTER TABLE ads ADD COLUMN IF NOT EXISTS owner_id UUID')
    op.execute('ALTER TABLE ads ADD COLUMN IF NOT EXISTS titulo VARCHAR(160)')
    op.execute('ALTER TABLE ads ADD COLUMN IF NOT EXISTS imagen VARCHAR(500)')
    op.execute('ALTER TABLE ads ADD COLUMN IF NOT EXISTS precio_servicio DOUBLE PRECISION')
    op.execute("ALTER TABLE ads ADD COLUMN IF NOT EXISTS estado VARCHAR(20) NOT NULL DEFAULT 'pendiente_pago'")
    op.execute('CREATE INDEX IF NOT EXISTS ix_ads_owner_id ON ads (owner_id)')
    op.execute('CREATE INDEX IF NOT EXISTS ix_ads_estado ON ads (estado)')
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'fk_ads_owner'
            ) THEN
                ALTER TABLE ads ADD CONSTRAINT fk_ads_owner
                    FOREIGN KEY (owner_id) REFERENCES users(id);
            END IF;
        END $$;
    """)


def downgrade():
    op.execute('DROP INDEX IF EXISTS ix_ads_estado')
    op.execute('DROP INDEX IF EXISTS ix_ads_owner_id')
    op.execute('ALTER TABLE ads DROP CONSTRAINT IF EXISTS fk_ads_owner')
    op.execute('ALTER TABLE ads DROP COLUMN IF EXISTS estado')
    op.execute('ALTER TABLE ads DROP COLUMN IF EXISTS precio_servicio')
    op.execute('ALTER TABLE ads DROP COLUMN IF EXISTS imagen')
    op.execute('ALTER TABLE ads DROP COLUMN IF EXISTS titulo')
    op.execute('ALTER TABLE ads DROP COLUMN IF EXISTS owner_id')
