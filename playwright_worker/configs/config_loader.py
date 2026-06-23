"""
Config Loader for Backlink Automation

Loads template default configs and merges with per-site overrides.
Site overrides are identified by target_site UUID (from the DB).

Usage:
    from configs.config_loader import load_config

    config = load_config(
        template_type="pligg",
        site_url="https://example.com",
        target_site_id="550e8400-e29b-41d4-..."  # optional UUID
    )

The merge strategy is a deep merge: nested dicts merge recursively,
site override values win over template defaults for the same key.
"""

import json
import os
import copy
import logging
from typing import Optional, Dict, Any
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# Directory paths relative to this file
_CONFIG_DIR = os.path.dirname(os.path.abspath(__file__))
_TEMPLATES_DIR = os.path.join(_CONFIG_DIR, "templates")
_SITES_DIR = os.path.join(_CONFIG_DIR, "sites")

# In-memory cache to avoid re-reading JSON files per job
_config_cache: Dict[str, dict] = {}


def _deep_merge(base: dict, override: dict) -> dict:
    """
    Recursively merge override into base. Override values win.
    Returns a new dict (does not mutate inputs).

    Example:
        base     = {"registration": {"username_field": "#reg_username", "email_field": "#reg_email"}}
        override = {"registration": {"username_field": "#new_username"}}
        result   = {"registration": {"username_field": "#new_username", "email_field": "#reg_email"}}
    """
    result = copy.deepcopy(base)
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = copy.deepcopy(value)
    return result


def _load_json_file(filepath: str) -> Optional[dict]:
    """Load a JSON file from disk. Returns None if file does not exist."""
    if not os.path.isfile(filepath):
        return None
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        logger.error(f"Failed to load config file {filepath}: {e}")
        return None


def _extract_domain(url: str) -> str:
    """Extract bare domain from a URL (e.g. 'https://www.example.com/path' -> 'example.com')."""
    parsed = urlparse(url)
    hostname = parsed.hostname or ""
    # Strip www. prefix for consistency
    if hostname.startswith("www."):
        hostname = hostname[4:]
    return hostname.lower()


def load_template_config(template_type: str) -> dict:
    """
    Load the default config for a template type.
    Returns the parsed JSON dict, or an empty dict if not found.
    Caches in memory after first load.
    """
    cache_key = f"template:{template_type}"
    if cache_key in _config_cache:
        return copy.deepcopy(_config_cache[cache_key])

    filepath = os.path.join(_TEMPLATES_DIR, f"{template_type}.json")
    config = _load_json_file(filepath)

    if config is None:
        logger.warning(f"No template config found at {filepath}. Using empty config.")
        config = {}

    _config_cache[cache_key] = config
    return copy.deepcopy(config)


def load_site_override(target_site_id: Optional[str] = None) -> Optional[dict]:
    """
    Load site-specific config override by UUID.
    
    Looks for:
        configs/sites/{target_site_id}.json

    Returns None if no override exists.
    """
    if target_site_id:
        filepath = os.path.join(_SITES_DIR, f"{target_site_id}.json")
        override = _load_json_file(filepath)
        if override:
            logger.info(f"Loaded site override from {filepath}")
            return override

    return None


def load_config(
    template_type: str,
    site_url: str = "",
    target_site_id: Optional[str] = None
) -> dict:
    """
    Load the fully merged config for a site.

    1. Load configs/templates/{template_type}.json  (defaults)
    2. Load configs/sites/{target_site_id}.json     (override, if exists)
    3. Deep-merge: override wins over defaults
    4. Return merged config dict

    Args:
        template_type:   The template type key (e.g., "pligg", "wordpress_submitpro").
        site_url:        The target site URL (used for logging context).
        target_site_id:  The target_sites.id UUID (used for override file lookup).

    Returns:
        Merged config dict. Always contains at least the template defaults.
    """
    # 1. Load template defaults
    base_config = load_template_config(template_type)

    # 2. Load site override by UUID
    site_override = load_site_override(target_site_id=target_site_id)

    # 3. Merge
    if site_override:
        domain = _extract_domain(site_url) if site_url else target_site_id
        logger.info(
            f"Merging site override for {domain} (id={target_site_id}) "
            f"into {template_type} template config"
        )
        merged = _deep_merge(base_config, site_override)
    else:
        merged = base_config

    return merged


def clear_cache():
    """Clear the in-memory config cache. Useful for testing or hot-reload."""
    _config_cache.clear()
    logger.info("Config cache cleared.")
