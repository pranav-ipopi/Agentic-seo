from ddgs import DDGS
from langchain_core.tools import tool

@tool
def web_search(query: str) -> str:
    """Free web search using DuckDuckGo."""
    results = []
    with DDGS() as ddgs:
        for r in ddgs.text(query, max_results=5):
            results.append(f"{r.get('title')} - {r.get('href')} - {r.get('body')}")
    return "\n".join(results)

@tool
def seo_brief(topic: str) -> str:
    """Turn a topic into a simple SEO brief."""
    return f"Create a blog post about: {topic}. Include search intent, headings, FAQs, and internal link ideas."
