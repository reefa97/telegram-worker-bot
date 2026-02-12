import re
from urllib.parse import urlparse
from .utils import BLACKLIST_DOMAINS, BLACKLIST_EXTENSIONS
import validators

class EmailExtractor:
    # Regex for finding emails
    EMAIL_REGEX = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'

    @staticmethod
    def extract_emails(text):
        """Finds all unique emails in the given text."""
        if not text:
            return set()
        
        emails = set(re.findall(EmailExtractor.EMAIL_REGEX, text))
        valid_emails = set()
        
        for email in emails:
            if EmailExtractor.is_valid(email):
                valid_emails.add(email.lower())
                
        return valid_emails

    @staticmethod
    def extract_social_links(links):
        """Categorizes links into social media platforms using refined patterns."""
        social_patterns = {
            "youtube": re.compile(r"^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/", re.I),
            "twitter": re.compile(r"^(https?:\/\/)?(www\.)?(twitter\.com|x\.com)\/", re.I),
            "facebook": re.compile(r"^(https?:\/\/)?(www\.)?facebook\.com\/", re.I),
            "instagram": re.compile(r"^(https?:\/\/)?(www\.)?instagram\.com\/", re.I),
            "linkedin": re.compile(r"^(https?:\/\/)?([a-z]{2,3}\.)?linkedin\.com\/", re.I),
        }
        
        results = {plat: [] for plat in social_patterns}
        
        for link in links:
            for platform, pattern in social_patterns.items():
                if pattern.match(link):
                    results[platform].append(link)
                    break
        
        return results

    @staticmethod
    def extract_contact_links(links):
        """Finds links that are likely to be contact or about pages."""
        contact_pattern = re.compile(r"contact|kontakt", re.I)
        
        results = []
        for link in links:
            if contact_pattern.search(link):
                results.append(link)
                
        return results

    @staticmethod
    def extract_emails_from_markdown(text):
        """Higher precision extraction for markdown/text content."""
        if not text:
            return set()
        # Ensure it's not a link disguised as email in markdown [email@domain](...)
        emails = set(re.findall(EmailExtractor.EMAIL_REGEX, text))
        return {e.lower() for e in emails if EmailExtractor.is_valid(e)}

    @staticmethod
    def is_valid(email):
        """Validates email against blacklists and format."""
        if not validators.email(email):
            return False
            
        domain = email.split('@')[-1].lower()
        if domain in BLACKLIST_DOMAINS:
            return False
            
        # Check for image file extensions in the email (sometimes regex catches them incorrectly)
        if any(email.endswith(ext) for ext in BLACKLIST_EXTENSIONS):
            return False
            
        return True

    @staticmethod
    def is_valid_url(url):
        """Checks if a URL is valid to crawl."""
        parsed = urlparse(url)
        if not parsed.scheme or not parsed.netloc:
            return False
            
        if any(url.lower().endswith(ext) for ext in BLACKLIST_EXTENSIONS):
            return False
            
        domain = parsed.netloc.lower()
        # Remove www.
        if domain.startswith("www."):
            domain = domain[4:]
            
        if domain in BLACKLIST_DOMAINS:
            return False
            
        return True
