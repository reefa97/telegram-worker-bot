
import re
import dns.resolver
from .utils import logger

# Strict Regex for email validation
EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")

# Domains to block (News, Aggregators, Generic Junk)
BLOCKED_DOMAINS = {
    "polskapress.pl", "gazetakrakowska.pl", "naszemiasto.pl", "gazeta.pl", 
    "onet.pl", "wp.pl", "interia.pl", "o2.pl", "gmail.com", "yahoo.com", "outlook.com", "hotmail.com" # Maybe block generic free emails? User said "irrelevant emails".
    # User complained about media group emails primarily.
}

# Specific prefixes to block if domain is generic (e.g. contact@gmail is ok? actually business@gmail is common)
# But abuse@, no-reply@ are bad.
BLOCKED_PREFIXES = {
    "abuse", "no-reply", "noreply", "postmaster", "webmaster", "hostmaster", "privacy", "legal", "subscription", "unsubscribe"
}
# Also editorial/press emails
BLOCKED_KEYWORDS = {"redakcja", "news", "prasa", "press", "media", "reklama", "oglo", "bok"}

class EmailValidator:
    @staticmethod
    def is_valid_format(email: str) -> bool:
        return bool(EMAIL_REGEX.match(email))

    @staticmethod
    def is_suspicious(email: str) -> bool:
        """Checks for suspicious patterns like random strings or long gibberish."""
        local, _ = email.split('@')
        
        # Check for % character
        if '%' in email:
            return True
            
        # User Example: hbvf47e8guergwegfhsugyf@bvdejyrb.pl
        
        # 1. Very long local part without standard separators
        # Increased to 45 because legal/medical emails can be very long
        if len(local) > 45 and not any(char in local for char in ".-_"):
            return True
            
        # 2. High density of numbers in local part
        digits = sum(c.isdigit() for c in local)
        if len(local) > 12 and digits / len(local) > 0.5:
            return True

        # 3. Large cluster of consonants (gibberish indicator)
        # Increased to 8 to avoid blocking long Polish words
        consonant_cluster = re.findall(r'[bcdfghjklmnpqrstvwxyz]{8,}', local.lower())
        if consonant_cluster:
            return True
            
        # 4. Total length check - extreme cases only
        if len(local) > 64:
            return True
            
        return False

    @staticmethod
    def is_blocked(email: str) -> bool:
        local, domain = email.split('@')
        
        # Check domain block
        if domain in BLOCKED_DOMAINS:
            return True
            
        # Check subdomains of blocked (e.g. krakow.naszemiasto.pl)
        for blocked in BLOCKED_DOMAINS:
            if domain.endswith("." + blocked):
                return True

        # Check suspicious patterns (% and gibberish)
        if EmailValidator.is_suspicious(email):
            return True

        # Check prefixes
        if local.lower() in BLOCKED_PREFIXES:
            return True
            
        # Check keywords in local part (e.g. redakcja-krakow@...)
        for kw in BLOCKED_KEYWORDS:
            if kw in local.lower():
                return True
                
        return False

    @staticmethod
    def has_mx_record(domain: str) -> bool:
        try:
            dns.resolver.resolve(domain, 'MX')
            return True
        except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN, dns.resolver.NoNameservers, dns.exception.Timeout):
            return False
        except Exception as e:
            logger.warning(f"DNS check error for {domain}: {e}")
            return False # Assume bad if DNS fails

    @staticmethod
    def validate(email: str) -> bool:
        if not email or "@" not in email:
            return False
            
        email = email.lower().strip()
        
        if not EmailValidator.is_valid_format(email):
            logger.debug(f"Invalid format: {email}")
            return False
            
        if EmailValidator.is_blocked(email):
            logger.debug(f"Blocked: {email}")
            return False
            
        # MX Check - strict, if domain has no mail server, it's invalid
        _, domain = email.split('@')
        if not EmailValidator.has_mx_record(domain):
            logger.debug(f"No MX record: {domain}")
            return False
            
        return True
