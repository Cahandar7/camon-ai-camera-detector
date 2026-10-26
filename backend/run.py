"""Start the CamOn backend: python run.py"""

import uvicorn

from app.config import settings

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        timeout_graceful_shutdown=1,  # MJPEG streams never end on their own
        log_level="warning",
    )
