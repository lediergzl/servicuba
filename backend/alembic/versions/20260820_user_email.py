"""add user email

Revision ID: 20260820_user_email
Revises: 20260820_premium_ads
Create Date: 2026-08-20
"""
from alembic import op
import sqlalchemy as sa

revision = "20260820_user_email"
down_revision = "20260820_premium_ads"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("email", sa.String(length=254), nullable=True))
    op.create_index("ix_users_email", "users", ["email"], unique=True)


def downgrade():
    op.drop_index("ix_users_email", table_name="users")
    op.drop_column("users", "email")
