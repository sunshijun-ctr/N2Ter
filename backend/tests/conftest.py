import sys
import asyncio
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def pytest_runtest_teardown(item, nextitem):
    from app.db import dispose_database

    asyncio.run(dispose_database())
