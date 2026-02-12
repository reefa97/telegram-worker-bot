import asyncio
import sys
import os

# Add the parent directory to sys.path to import core modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.crawler import AsyncCrawler

async def test_fetch():
    crawler = AsyncCrawler()
    url = "https://example.com"
    print(f"Testing fetch for {url}...")
    
    html, markdown, final_url = await crawler.fetch_page(url)
    
    if html and markdown:
        print("✅ Successfully fetched page with Playwright!")
        print(f"Final URL: {final_url}")
        print(f"Markdown preview (first 100 chars):\n{markdown[:100]}...")
    else:
        print("❌ Failed to fetch page.")

if __name__ == "__main__":
    asyncio.run(test_fetch())
