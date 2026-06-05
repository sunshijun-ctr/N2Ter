from app.workers.celery_app import celery_app


@celery_app.task(name="preprocess_novel")
def preprocess_novel(novel_id: str) -> dict:
    return {"novel_id": novel_id, "status": "stub"}


@celery_app.task(name="generate_episode")
def generate_episode(screenplay_id: str, episode_num: int) -> dict:
    return {
        "screenplay_id": screenplay_id,
        "episode_num": episode_num,
        "status": "stub",
    }


@celery_app.task(name="export_screenplay")
def export_screenplay(screenplay_id: str, export_format: str) -> dict:
    return {
        "screenplay_id": screenplay_id,
        "export_format": export_format,
        "status": "stub",
    }
