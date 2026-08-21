"""merge premium ads and user email migration heads

Revision ID: 20260821_merge_heads
Revises: 20260820_premium_ads, 20260820_user_email
Create Date: 2026-08-21
"""

revision = "20260821_merge_heads"
down_revision = ("20260820_premium_ads", "20260820_user_email")
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
