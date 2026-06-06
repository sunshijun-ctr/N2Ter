from fastapi.testclient import TestClient

from app.main import app


def test_prompt_routes() -> None:
    client = TestClient(app)
    list_response = client.get("/api/prompts")
    assert list_response.status_code == 200, list_response.text
    names = {item["name"] for item in list_response.json()}
    assert "conversation_agent" in names

    read_response = client.get("/api/prompts/conversation_agent")
    assert read_response.status_code == 200, read_response.text
    assert "content" in read_response.json()


def test_skill_database_routes() -> None:
    with TestClient(app) as client:
        list_response = client.get("/api/skills/db")
    assert list_response.status_code == 200, list_response.text
    names = {item["name"] for item in list_response.json()}
    assert "skill_general" in names
