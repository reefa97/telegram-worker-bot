import asyncio
import os
import sys
from pathlib import Path

# Add project root to path
sys.path.append(str(Path(__file__).resolve().parent.parent))

from core.enrichment import BusinessAnalyzer
from dotenv import load_dotenv

# Load env from root
load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent.parent / '.env.local')

async def test_enrichment():
    print("Testing AI Enrichment...")
    
    business_name = "Cleaning Pros"
    business_url = "https://cleaningpros.com"
    
    # Test Link Analysis
    links = {
        "facebook": ["https://facebook.com/cleaningpros", "https://facebook.com/personal-profile"],
        "instagram": ["https://instagram.com/cleaningpros_official"],
        "twitter": [],
        "linkedin": ["https://linkedin.com/company/cleaningpros"]
    }
    
    print(f"\nAnalyzing links for: {business_name}")
    links_info = await BusinessAnalyzer.analyze_links(links, business_name, business_url)
    print(f"Resulting Links:")
    print(f" - FB: {links_info.facebook}")
    print(f" - IG: {links_info.instagram}")
    print(f" - LI: {links_info.linkedin}")
    
    # Test Email Analysis
    emails = ["info@cleaningpros.com", "john.doe@gmail.com", "support@cleaningpros.com", "marketing@external.com"]
    
    print(f"\nAnalyzing emails for: {business_name}")
    best_emails = await BusinessAnalyzer.analyze_emails(emails, business_name, business_url)
    print(f"Best Emails: {best_emails}")

if __name__ == "__main__":
    asyncio.run(test_enrichment())
