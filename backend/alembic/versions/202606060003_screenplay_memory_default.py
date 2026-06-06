"""Set screenplay memory default.

Revision ID: 202606060003
Revises: 202606060002
Create Date: 2026-06-06
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "202606060003"
down_revision: Union[str, None] = "202606060002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "screenplays",
        "screenplay_memory",
        server_default=sa.text("'{}'::jsonb"),
        existing_type=postgresql.JSONB(),
    )


def downgrade() -> None:
    op.alter_column(
        "screenplays",
        "screenplay_memory",
        server_default=None,
        existing_type=postgresql.JSONB(),
    )
