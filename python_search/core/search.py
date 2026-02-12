import requests
import json
from .utils import logger

class SearchManager:
    def __init__(self, api_key, engine="serper"):
        self.api_key = api_key
        self.engine = engine # serper or serpapi

    def search(self, query, num_results=10, page=1, search_type="search"):
        """
        Executes a search query and returns a list of URLs.
        search_type can be "search" (organic) or "maps".
        """
        if self.engine == "serper":
            if search_type == "maps":
                return self._search_serper_maps(query, num_results, page)
            return self._search_serper(query, num_results, page)
        elif self.engine == "serpapi":
            return self._search_serpapi(query, num_results, page)
        else:
            logger.error(f"Unknown search engine: {self.engine}")
            return []

    def _search_serper(self, query, num_results, page):
        url = "https://google.serper.dev/search"
        payload = json.dumps({
            "q": query,
            "num": num_results,
            "page": page
        })
        headers = {
            'X-API-KEY': self.api_key,
            'Content-Type': 'application/json'
        }
        
        try:
            response = requests.post(url, headers=headers, data=payload)
            response.raise_for_status()
            data = response.json()
            
            links = []
            if "organic" in data:
                for result in data["organic"]:
                    if "link" in result:
                        link = result["link"]
                        if not link.startswith("http"):
                            link = "https://" + link
                        links.append(link)
            return links
        except Exception as e:
            logger.error(f"Serper Organic API Error: {e}")
            return []

    def _search_serper_maps(self, query, num_results, page):
        # Serper Maps/Places API only supports up to 10 pages
        if page > 10:
            return []
            
        # Use 'places' endpoint for better text-to-business matching
        url = "https://google.serper.dev/places"
        payload = json.dumps({
            "q": query,
            "page": page
        })
        headers = {
            'X-API-KEY': self.api_key,
            'Content-Type': 'application/json'
        }
        
        try:
            response = requests.post(url, headers=headers, data=payload)
            response.raise_for_status()
            data = response.json()
            
            links = []
            # 'places' endpoint returns results in data['places']
            if "places" in data:
                for result in data["places"]:
                    if "website" in result and result["website"]:
                        link = result["website"]
                        if not link.startswith("http"):
                            link = "https://" + link
                        links.append(link)
            # Fallback to 'maps' key if using the maps endpoint instead
            elif "maps" in data:
                for result in data["maps"]:
                    if "website" in result and result["website"]:
                        link = result["website"]
                        if not link.startswith("http"):
                            link = "https://" + link
                        links.append(link)
            return links
        except Exception as e:
            logger.error(f"Serper Places API Error (Page {page}): {e}")
            return []

    def _search_serpapi(self, query, num_results, page):
        # Placeholder for SerpApi implementation if needed later
        # We start with Serper as primary as it's usually faster/cheaper for this use case
        logger.warning("SerpApi not fully implemented yet, switching to empty list.")
        return []
