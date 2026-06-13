"""
Template Runner for Backlink Automation

Centralized template resolution + config loading.
Replaces the inline if/elif router in vps_worker_playwright.py.

The runner:
    1. Maps site_id (from target_sites.site_id) → template class
    2. Maps site_id → config file name (handles aliases like phpld → wordpress_submitpro)
    3. Loads merged config (template defaults + site UUID override)
    4. Instantiates the correct template with the merged config
    5. Calls template.run(client_url, keyword)

Adding a new template:
    1. Create the template class extending BaseTemplate
    2. Add its default config JSON in configs/templates/
    3. Register it in TEMPLATE_REGISTRY below
    4. Update the edge function to detect the new site type

That's it — the runner, worker, and failure handler all work automatically.
"""

import logging
from typing import Dict, Any, Type, Optional

from configs.config_loader import load_config
from executor.errors import UnsupportedTemplateError


# -----------------------------------------------------------------------
# Template Registry
#
# Maps site_id values (from target_sites.site_id in DB) to:
#   - template_class: The Python class to instantiate
#   - config_name:    The config file name in configs/templates/ (without .json)
#
# To add a new template type:
#   1. Import your TemplateClass
#   2. Add an entry:  "new_site_id": {"class": NewTemplate, "config": "new_config"}
#
# Aliases are supported: multiple site_id values can map to the same
# template class and config (e.g., "phpld" → wordpress_submitpro).
# -----------------------------------------------------------------------

def _build_registry() -> Dict[str, Dict[str, Any]]:
    """
    Build the template registry lazily to avoid circular imports.
    Called once on first use, then cached.
    """
    from templates.pligg_generic import PliggGenericTemplate
    from templates.wordpress_submitpro import WordPressSubmitProTemplate

    return {
        # Pligg / Kliqqi CMS
        "pligg": {
            "class": PliggGenericTemplate,
            "config": "pligg",
        },

        # WordPress SubmitPro plugin
        "wordpress_submitpro": {
            "class": WordPressSubmitProTemplate,
            "config": "wordpress_submitpro",
        },

        # Legacy alias: edge function may still store "phpld" for some sites
        "phpld": {
            "class": WordPressSubmitProTemplate,
            "config": "wordpress_submitpro",
        },

        # ---------------------------------------------------------------
        # Future templates — uncomment and implement when ready:
        #
        # "scuttle": {
        #     "class": ScuttleTemplate,
        #     "config": "scuttle",
        # },
        #
        # "drigg": {
        #     "class": DriggTemplate,
        #     "config": "drigg",
        # },
        # ---------------------------------------------------------------
    }


# Module-level cache for the registry
_registry_cache: Optional[Dict[str, Dict[str, Any]]] = None


def _get_registry() -> Dict[str, Dict[str, Any]]:
    """Get or build the template registry (cached)."""
    global _registry_cache
    if _registry_cache is None:
        _registry_cache = _build_registry()
    return _registry_cache


class TemplateRunner:
    """
    Resolves the correct template class + merged config for a given site,
    then executes it.

    Usage:
        runner = TemplateRunner()
        result = await runner.execute(
            site_id="pligg",
            target_url="https://example.com",
            target_site_db_id="550e8400-...",
            client_url="https://client-site.com",
            keyword="target keyword",
            browser_manager=browser_manager,
            captcha_service=captcha_service,
            logger=logger
        )
    """

    def get_supported_templates(self) -> list:
        """Return list of registered site_id values."""
        return list(_get_registry().keys())

    def is_supported(self, site_id: str) -> bool:
        """Check if a site_id has a registered template."""
        return site_id in _get_registry() if site_id else False

    async def execute(
        self,
        site_id: str,
        target_url: str,
        target_site_db_id: Optional[str],
        client_url: str,
        keyword: str,
        browser_manager,
        captcha_service,
        logger: logging.Logger
    ) -> Dict[str, Any]:
        """
        Execute the full automation flow for a site.

        Args:
            site_id:            Template identifier from target_sites.site_id
                                (e.g., "pligg", "wordpress_submitpro", "phpld")
            target_url:         The target site URL to automate on
            target_site_db_id:  The target_sites.id UUID (for config override lookup)
            client_url:         The client URL to create a backlink for
            keyword:            The target keyword
            browser_manager:    StealthBrowserManager instance
            captcha_service:    CaptchaService instance
            logger:             Logger instance

        Returns:
            Result dict from template.run() containing backlink_url, success, message

        Raises:
            UnsupportedTemplateError: If no template is registered for site_id
            AutomationError subclasses: On classified failures
            Exception: On unexpected failures
        """
        registry = _get_registry()

        if not site_id or site_id not in registry:
            raise UnsupportedTemplateError(
                site_id=site_id or "None",
                message=(
                    f"No template registered for site_id='{site_id}' (target: {target_url}). "
                    f"Supported templates: {list(registry.keys())}. "
                    f"Run the detect-site-templates edge function to fingerprint this site."
                )
            )

        entry = registry[site_id]
        template_class = entry["class"]
        config_name = entry["config"]

        # Load merged config (template defaults + site UUID override)
        config = load_config(
            template_type=config_name,
            site_url=target_url,
            target_site_id=target_site_db_id
        )

        logger.info(
            f"[TemplateRunner] Routing {target_url} → "
            f"{template_class.__name__} (site_id={site_id}, config={config_name})"
        )

        # Instantiate template with merged config
        template = template_class(
            target_url=target_url,
            browser_manager=browser_manager,
            captcha_service=captcha_service,
            logger=logger,
            config=config
        )

        # Execute
        result = await template.run(client_url, keyword)

        return result
