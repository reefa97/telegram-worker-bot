import asyncio
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
from .utils import logger, USER_AGENT
from .extractor import EmailExtractor
from playwright.async_api import async_playwright
import html2text
import re

class AsyncCrawler:
    def __init__(self, deep_scan=True, max_depth=1, max_concurrency=10):
        self.deep_scan = deep_scan
        self.max_depth = max_depth
        self.semaphore = asyncio.Semaphore(max_concurrency)
        self.seen_urls = set()
        # Note: Playwright handles UA and isolation internally in fetch_page

    async def fetch_page(self, url):
        """Fetches a page content using Playwright for robustness."""
        try:
            async with self.semaphore:
                async with async_playwright() as p:
                    browser = await p.chromium.launch(headless=True, args=["--disable-http2"])
                    context = await browser.new_context(
                        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
                        locale="en-US",
                        ignore_https_errors=True
                    )
                    page = await context.new_page()
                    await page.goto(url, timeout=45000, wait_until="domcontentloaded")
                    
                    html_content = await page.content()
                    final_url = page.url
                    await browser.close()
                    
                    # Convert to markdown for better extraction
                    h = html2text.HTML2Text()
                    h.ignore_links = False
                    h.ignore_images = True
                    h.ignore_tables = True
                    markdown_text = h.handle(html_content)
                    markdown_text = re.sub(r"\n{3,}", "\n\n", markdown_text).strip()
                    
                    return html_content, markdown_text, final_url
        except Exception as e:
            logger.warning(f"Error fetching {url} with Playwright: {e}")
            return None, None, url

    def _empty_results(self):
        return {
            'emails': set(),
            'social': {'facebook': [], 'instagram': [], 'twitter': [], 'linkedin': [], 'youtube': []},
            'contacts': []
        }

    async def process_url(self, url, keyword, db_manager, username, current_depth=0, source_type="organic"):
        """
        Process a single URL: fetch, extract emails, finding contact links.
        Returns a dict of found data: {emails: [], social: {}, contacts: []}
        """
        try:
            results = self._empty_results()
            if url in self.seen_urls:
                return results
            self.seen_urls.add(url)

            logger.info(f"Scanning: {url} (Depth: {current_depth})")
            html, markdown, final_url = await self.fetch_page(url)
            if not html:
                return results

            # Extract emails from markdown (refined) and html (fallback)
            emails = EmailExtractor.extract_emails_from_markdown(markdown)
            if not emails:
                emails = EmailExtractor.extract_emails(html)

            for email in emails:
                is_new = db_manager.save_email(email, final_url, keyword, username, source_type=source_type)
                if is_new:
                    results['emails'].add(email)
                    logger.info(f"Found email: {email} on {final_url} (Source: {source_type})")

            # Extract all links for categorization — guard against malformed IPv6 hrefs
            soup = BeautifulSoup(html, 'html.parser')
            links = []
            for a in soup.find_all('a', href=True):
                try:
                    links.append(urljoin(url, a['href']))
                except ValueError:
                    pass

            platform_links = EmailExtractor.extract_social_links(links)
            for plat, plat_links in platform_links.items():
                results['social'][plat].extend(plat_links)

            # Deep scan logic
            if self.deep_scan and current_depth < self.max_depth:
                contact_links_candidates = EmailExtractor.extract_contact_links(links)

                contact_links = []
                for full_url in contact_links_candidates:
                    # Validation
                    if not EmailExtractor.is_valid_url(full_url):
                        continue

                    # Check if internal link — guard against malformed IPv6 in urlparse
                    try:
                        if urlparse(full_url).netloc != urlparse(url).netloc:
                            continue
                    except ValueError:
                        continue

                    if full_url not in self.seen_urls:
                        contact_links.append(full_url)
                        results['contacts'].append(full_url)

                # Process contact links recursively — return_exceptions so one bad URL doesn't kill the batch
                tasks = []
                for link in contact_links:
                    tasks.append(self.process_url(link, keyword, db_manager, username, current_depth + 1, source_type=source_type))

                if tasks:
                    sub_results = await asyncio.gather(*tasks, return_exceptions=True)
                    for res in sub_results:
                        if isinstance(res, Exception):
                            logger.warning(f"Sub-task failed: {res}")
                            continue
                        results['emails'].update(res['emails'])
                        for plat, plat_links in res['social'].items():
                            results['social'][plat].extend(plat_links)
                        results['contacts'].extend(res['contacts'])

            return results
        except Exception as e:
            logger.warning(f"process_url failed for {url}: {e}")
            return self._empty_results()

    async def crawl_urls(self, urls, keyword, db_manager, username, source_type="organic"):
        """Main entry point to crawl a list of URLs."""
        tasks = []
        for url in urls:
            if EmailExtractor.is_valid_url(url):
                 tasks.append(self.process_url(url, keyword, db_manager, username, source_type=source_type))

        # Run all top-level URL tasks — return_exceptions so one bad URL never kills the whole batch
        results = await asyncio.gather(*tasks, return_exceptions=True)
        results = [r for r in results if not isinstance(r, Exception)]
        
        # Aggregate and deduplicate
        final_data = {
            'emails': list(set().union(*(res['emails'] for res in results))),
            'social': {plat: list(set().union(*(res['social'][plat] for res in results))) for plat in ['facebook', 'instagram', 'twitter', 'linkedin', 'youtube']},
            'contacts': list(set().union(*(res['contacts'] for res in results)))
        }
        return final_data
