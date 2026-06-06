"""Agent screenplay branches and memory.

Revision ID: 202606060002
Revises: 202606060001
Create Date: 2026-06-06
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "202606060002"
down_revision: Union[str, None] = "202606060001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    bind.exec_driver_sql("ALTER TYPE task_type ADD VALUE IF NOT EXISTS 'generate_screenplay';")
    op.add_column("screenplays", sa.Column("parent_screenplay_id", postgresql.UUID(), nullable=True))
    op.add_column(
        "screenplays",
        sa.Column("screenplay_memory", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=True),
    )
    op.add_column("screenplays", sa.Column("branch_name", sa.Text(), nullable=True))
    op.add_column(
        "screenplays", sa.Column("branch_type", sa.Text(), server_default="initial", nullable=False)
    )
    op.add_column("screenplays", sa.Column("regeneration_instruction", sa.Text(), nullable=True))
    op.add_column(
        "screenplays", sa.Column("plan_source", sa.Text(), server_default="initial", nullable=False)
    )
    op.create_foreign_key(
        "fk_screenplays_parent",
        "screenplays",
        "screenplays",
        ["parent_screenplay_id"],
        ["id"],
        ondelete="SET NULL",
    )
    bind.exec_driver_sql("UPDATE screenplays SET screenplay_memory = '{}'::jsonb WHERE screenplay_memory IS NULL;")
    op.alter_column("screenplays", "screenplay_memory", nullable=False)


def downgrade() -> None:
    op.drop_constraint("fk_screenplays_parent", "screenplays", type_="foreignkey")
    op.drop_column("screenplays", "plan_source")
    op.drop_column("screenplays", "regeneration_instruction")
    op.drop_column("screenplays", "branch_type")
    op.drop_column("screenplays", "branch_name")
    op.drop_column("screenplays", "screenplay_memory")
    op.drop_column("screenplays", "parent_screenplay_id")
