"""premium promotional ads

Revision ID: 20260820_premium_ads
Revises: 20260819_01
Create Date: 2026-08-20
"""
from alembic import op
import sqlalchemy as sa

revision = "20260820_premium_ads"
down_revision = "20260819_01"
branch_labels = None
depends_on = None


def upgrade():
    # This migration is additive and is intentionally linked to the production
    # baseline so Alembic has a single linear head.
    op.add_column("ads", sa.Column("owner_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_ads_owner", "ads", "users", ["owner_id"], ["id"])
    op.create_index("ix_ads_owner_id", "ads", ["owner_id"])
    op.add_column("ads", sa.Column("titulo", sa.String(length=160), nullable=True))
    op.add_column("ads", sa.Column("imagen", sa.String(length=500), nullable=True))
    op.add_column("ads", sa.Column("precio_servicio", sa.Float(), nullable=True))
    op.add_column("ads", sa.Column("estado", sa.String(length=20), nullable=False, server_default="pendiente_pago"))
    op.create_index("ix_ads_estado", "ads", ["estado"])


def downgrade():
    op.drop_index("ix_ads_estado", table_name="ads")
    op.drop_column("ads", "estado")
    op.drop_column("ads", "precio_servicio")
    op.drop_column("ads", "imagen")
    op.drop_column("ads", "titulo")
    op.drop_index("ix_ads_owner_id", table_name="ads")
    op.drop_constraint("fk_ads_owner", "ads", type_="foreignkey")
    op.drop_column("ads", "owner_id")
