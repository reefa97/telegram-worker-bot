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

        system_prompt = f"""Jesteś ekspertem od generowania leadów B2B w Polsce i Europie.

Twoje zadanie: z podanej listy e-maili wybierz TYLKO te, które są prawdziwymi kontaktami biznesowymi powiązanymi z zapytaniem: "{business_name}".

## PRIORYTET WYBORU (od najważniejszego):

1. **Ogólne e-maile kontaktowe na domenie firmowej:**
   kontakt@, biuro@, info@, office@, recepcja@, sekretariat@, rejestracja@, hello@, sprzedaz@, zamowienia@, obsluga@

2. **Imienne e-maile kluczowych osób** (np. jan.kowalski@firma.pl, m.nowak@firma.pl) — jeśli domena wygląda na firmową.

3. **E-maile działowe** powiązane z zapytaniem (np. dla usług sprzątania: serwis@, dla biur: wynajem@, dla medycznych: rejestracja@).

4. **E-maile na darmowych domenach** (gmail.com, wp.pl, o2.pl, interia.pl, onet.pl) — ZACHOWAJ jeśli wyglądają jak kontakt małej firmy (np. firmakowalski@gmail.com), USUŃ jeśli wyglądają na prywatne (np. kasia123@wp.pl).

## ZASADY USUWANIA (usuwaj TYLKO te kategorie):

- **USUŃ** e-maile techniczne: webmaster@, postmaster@, abuse@, noreply@, newsletter@, privacy@, unsubscribe@, it@
- **USUŃ** e-maile z losowymi ciągami znaków lub hashami (np. x7f2k@..., 234sdf@...)
- **USUŃ** e-maile które EWIDENTNIE nie mają nic wspólnego z branżą z zapytania

**NIE USUWAJ** jeśli e-mail jest z tej samej firmy ale z innego miasta/oddziału — to wciąż wartościowy kontakt.

## KLUCZOWE ZASADY:

- W razie wątpliwości — **ZACHOWAJ e-mail**. Lepiej zostawić jeden niepewny niż stracić prawdziwy kontakt.
- NIE usuwaj e-maili tylko dlatego, że domena jest na darmowym providerze — wiele małych firm w Polsce używa gmail/wp/o2.
- Oceń każdy e-mail indywidualnie w kontekście zapytania "{business_name}".

Zwróć listę zatwierdzonych e-maili."""

        user_message = f"Znalezione e-maile do oceny: {list(set(emails))}"
        
        result = await ainvoke_llm(
            system_prompt=system_prompt,
            user_message=user_message,
            response_format=EmailsResponse
        )
        return result.emails if result else None

def json_dumps(d):
    import json
    return json.dumps(d, indent=2)
