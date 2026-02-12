import os
from typing import List, Dict, Optional
from pydantic import BaseModel
from .ai import ainvoke_llm
from .utils import logger

class BusinessInfo(BaseModel):
    facebook: str = ""
    twitter: str = ""
    instagram: str = ""
    linkedin: str = ""
    contact: str = ""

class EmailsResponse(BaseModel):
    emails: List[str] = []

class BusinessAnalyzer:
    @staticmethod
    async def analyze_links(
        links_dict: Dict[str, List[str]], 
        business_name: str, 
        business_url: str
    ) -> BusinessInfo:
        system_prompt = f"""
        You are an expert at identifying official business social media links from scraped data.
        Select the most probable official link for each category.
        
        ## Business Context
        - Name: {business_name}
        - Website: {business_url}
        
        Provide only the most probable link. If none, return empty string.
        """

        user_message = f"Potential links extracted from HTML:\n{json_dumps(links_dict)}"
        
        result = await ainvoke_llm(
            system_prompt=system_prompt,
            user_message=user_message,
            response_format=BusinessInfo
        )
        return result or BusinessInfo()

    @staticmethod
    async def analyze_emails(
        emails: List[str], 
        business_name: str, 
        business_url: str
    ) -> List[str]:
        if not emails:
            return []

        system_prompt = f"""
        You are a strict data cleaning assistant. Your goal is to filter a list of emails to find ONLY those belonging to the target business or industry described by the query: "{business_name}".

        **Rules for Inclusion:**
        - Include emails that clearly belong to the business (e.g., if query is 'dentist', include 'dr.smith@dentist-name.com').
        - Prioritize HIGHLY plausible generic contact emails. In order of preference:
            1. kontakt@, rejestracja@, recepcja@, biuro@ (especially for medical/hospital queries, prioritize 'rejestracja' and 'recepcja').
            2. info@, office@, office.manager@.
        - LIMIT GENERIC EMAILS: For many emails with the same domain (e.g., kontakt@enel.pl, biuro@enel.pl, office@enel.pl), keep ONLY the 1 or 2 most plausible ones from the list above.

        **Rules for Exclusion (CRITICAL):**
        - DISCARD any email containing the '%' character (this is usually a scraping error).
        - DISCARD "suspicious" emails that look like random hashes (e.g., hbvf47e8guergwegfhsugyf@...).
        - DISCARD emails from news portals, newspapers, or media aggregators (e.g., @polskapress.pl, @gazetakrakowska.pl, @naszemiasto.pl, redakcja@, news@).
        - DISCARD unrelated generic emails (e.g., webmaster@, abuse@, privacy@, iod@).
        - DISCARD marketing/spam emails.

        Return ONLY the list of highly relevant, clean emails. If unsure, EXCLUDE it.
        """

        user_message = f"Found potential emails: {list(set(emails))}"
        
        result = await ainvoke_llm(
            system_prompt=system_prompt,
            user_message=user_message,
            response_format=EmailsResponse
        )
        return result.emails if result else []

def json_dumps(d):
    import json
    return json.dumps(d, indent=2)
