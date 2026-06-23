# Templates package - site specific implementations
#
# All templates extend BaseTemplate and are config-driven.
# Template registration happens in executor/runner.py (TEMPLATE_REGISTRY).
#
# Available templates:
#   - PliggGenericTemplate       (pligg_generic.py)   — Pligg/Kliqqi CMS sites
#   - WordPressSubmitProTemplate (wordpress_submitpro.py) — WordPress SubmitPro sites

from .base_template import BaseTemplate
from .pligg_generic import PliggGenericTemplate
from .wordpress_submitpro import WordPressSubmitProTemplate

__all__ = [
    "BaseTemplate",
    "PliggGenericTemplate",
    "WordPressSubmitProTemplate",
]
