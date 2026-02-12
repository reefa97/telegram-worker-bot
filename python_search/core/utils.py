import logging
import os
import sys

# Configure logging
def setup_logging():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout)
        ]
    )
    return logging.getLogger("EmailScraper")

logger = setup_logging()

# User Agent for requests
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"

# Blacklists
BLACKLIST_DOMAINS = {
    "sentry.io", "wix.com", "google.com", "facebook.com", "linkedin.com", 
    "twitter.com", "instagram.com", "youtube.com", "github.com", "gitlab.com",
    "stackoverflow.com", "medium.com", "amazon.com", "microsoft.com", "apple.com"
}

BLACKLIST_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".gif", ".pdf", ".zip", ".rar", ".tar", ".gz", 
    ".exe", ".dmg", ".iso", ".mp4", ".mp3", ".avi", ".svg", ".css", ".js"
}
