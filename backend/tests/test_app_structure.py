from app.db import Base
from app.main import app


def test_expected_tables_are_registered() -> None:
    expected_tables = {
        "novels",
        "chapters",
        "scenes_in_novel",
        "characters",
        "screenplays",
        "episodes",
        "episode_versions",
        "conversations",
        "messages",
        "compressed_segments",
        "tasks",
        "progress_events",
        "exports",
        "skills",
    }

    assert expected_tables.issubset(Base.metadata.tables.keys())


def test_api_routes_are_registered() -> None:
    paths = {route.path for route in app.routes}

    assert "/api/novels" in paths
    assert "/api/screenplays" in paths
    assert "/api/conversations" in paths
    assert "/api/tasks/{task_id}" in paths
    assert "/ws/conversations/{conversation_id}" in paths
