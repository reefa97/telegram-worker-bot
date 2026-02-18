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
        You are a smart lead generation assistant. Your goal is to Identify valid contact emails for the business or industry described by the query: "{business_name}".

        **Guidelines for KEEPING emails:**
        1. **MUST KEEP** generic contact emails commonly used in Poland/Europe:
           - kontakt@, biuro@, rejestracja@, recepcja@, sekretariat@, info@, office@, hello@, welcome@, sprzedaz@.
        2. **MUST KEEP** specific role-based emails relevant to the context (e.g., for "serviced offices", keep lynda@... or manager@...).
        3. **MUST KEEP** emails that appear to be direct personal contacts (e.g., name.surname@domain.com) IF the domain matches the business.

        **Guidelines for REMOVING emails:**
        - Remove technical/automated emails: webmaster@, admin@ (unless it looks like a small biz), abuse@, privacy@, noreply@, newsletter@.
        - Remove obvious scraping errors or hashes (e.g., 234234sfd@...).
        - Remove media/press emails if the query is for a service provider (e.g., redakcja@, news@) UNLESS the query is looking for media.

        **Context Check:**
        - If the query is "{business_name}", ensure the email domain or user seems relevant.
        - If unsure, **KEEP THE EMAIL**. Do not be over-aggressive.
        
        Return the list of valid, relevant emails.
        """

        user_message = f"Found potential emails: {list(set(emails))}"
        
        result = await ainvoke_llm(
            system_prompt=system_prompt,
            user_message=user_message,
            response_format=EmailsResponse
        )
        return result.emails if result else None

def json_dumps(d):
    import json
    return json.dumps(d, indent=2)
