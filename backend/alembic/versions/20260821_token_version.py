"""add user token version

Revision ID: 20260821_token_version
Revises: 20260821_merge_heads
Create Date: 2026-08-21
"""
from alembic import op
import sqlalchemy as sa

revision = "20260821_token_version"
down_revision = "20260821_merge_heads"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "users",
        sa.Column("token_version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.alter_column("users", "token_version", server_default=None)


def downgrade():
    op.drop_column("users", "token_version")
