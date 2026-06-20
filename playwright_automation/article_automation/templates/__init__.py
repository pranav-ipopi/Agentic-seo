from .medium import submit_article as submit_medium
from .reddit import submit_article as submit_reddit
from .wordpress import submit_article as submit_wordpress

# Add to this mapping as you add more templates
PLATFORM_TEMPLATES = {
    "medium": submit_medium,
    "reddit": submit_reddit,
    "wordpress": submit_wordpress,
}

def get_template(platform_name: str):
    return PLATFORM_TEMPLATES.get(platform_name.lower())
