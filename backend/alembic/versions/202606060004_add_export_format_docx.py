"""Add docx to export_format enum."""

from alembic import op

revision = "202606060004"
down_revision = "202606060003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE export_format ADD VALUE IF NOT EXISTS 'docx'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values safely.
    pass
