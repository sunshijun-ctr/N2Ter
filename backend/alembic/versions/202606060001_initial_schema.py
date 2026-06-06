"""Initial schema from db/ddl.sql.

Revision ID: 202606060001
Revises:
Create Date: 2026-06-06
"""

from pathlib import Path
from typing import Sequence, Union

from alembic import op

revision: str = "202606060001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def split_sql_script(script: str) -> list[str]:
    statements: list[str] = []
    current: list[str] = []
    in_dollar_quote = False
    index = 0

    while index < len(script):
        if script.startswith("$$", index):
            in_dollar_quote = not in_dollar_quote
            current.append("$$")
            index += 2
            continue

        char = script[index]
        if char == ";" and not in_dollar_quote:
            statement = "".join(current).strip()
            if statement:
                statements.append(statement)
            current = []
        else:
            current.append(char)
        index += 1

    statement = "".join(current).strip()
    if statement:
        statements.append(statement)
    return statements


def upgrade() -> None:
    ddl_path = Path(__file__).resolve().parents[3] / "db" / "ddl.sql"
    bind = op.get_bind()
    for statement in split_sql_script(ddl_path.read_text(encoding="utf-8")):
        bind.exec_driver_sql(statement)


def downgrade() -> None:
    bind = op.get_bind()
    bind.exec_driver_sql("DROP VIEW IF EXISTS v_novel_preprocessing;")
    bind.exec_driver_sql(
        """
        DROP TABLE IF EXISTS
            skills,
            exports,
            progress_events,
            tasks,
            compressed_segments,
            messages,
            conversations,
            episode_versions,
            episodes,
            screenplays,
            characters,
            scenes_in_novel,
            chapters,
            novels,
            users
        CASCADE;
        """
    )
    bind.exec_driver_sql(
        """
        DROP TYPE IF EXISTS
            export_status,
            export_format,
            message_role,
            conversation_status,
            conversation_context,
            quality_level,
            character_role,
            task_status,
            task_type,
            episode_status,
            screenplay_status,
            schema_type,
            novel_status
        CASCADE;
        """
    )
