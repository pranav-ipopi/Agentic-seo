"""
Typed Error Classes for Backlink Automation

Each error class represents a specific failure mode during site automation.
These are used by:
    - BaseTemplate.safe_goto() for navigation errors
    - Templates for step-specific failures
    - FailureHandler for error classification
    - task_run_logs for structured error metadata

Error types correspond to the error_type field stored in task_run_logs.metadata.
"""


class AutomationError(Exception):
    """
    Base error for all automation failures.
    
    Attributes:
        error_type: Machine-readable classification (e.g., "SITE_DOWN")
        step: Which automation step failed (e.g., "registration", "submit_bookmark")
        url: The target site URL involved
    """
    error_type: str = "UNKNOWN"

    def __init__(self, message: str = "", step: str = "", url: str = ""):
        self.step = step
        self.url = url
        super().__init__(message)


class SiteDownError(AutomationError):
    """Site is unreachable — connection refused, DNS failure, or HTTP 5xx."""
    error_type = "SITE_DOWN"


class ConnectionTimeoutError(AutomationError):
    """Page load timed out after all retry attempts."""
    error_type = "TIMEOUT"


class SelectorNotFoundError(AutomationError):
    """
    A required DOM element could not be found.
    This usually means the site changed its HTML structure and needs
    a site-specific config override.
    """
    error_type = "SELECTOR_NOT_FOUND"

    def __init__(self, selector: str = "", message: str = "", step: str = "", url: str = ""):
        self.selector = selector
        super().__init__(message or f"Selector not found: {selector}", step=step, url=url)


class LoginFailedError(AutomationError):
    """Login attempt failed — wrong credentials, account locked, etc."""
    error_type = "LOGIN_FAILED"


class RegistrationFailedError(AutomationError):
    """Account registration failed — duplicate user, blocked domain, etc."""
    error_type = "REGISTRATION_FAILED"


class SubmissionFailedError(AutomationError):
    """Bookmark/article submission failed."""
    error_type = "SUBMISSION_FAILED"


class CaptchaFailedError(AutomationError):
    """Captcha solving failed after all attempts."""
    error_type = "CAPTCHA_FAILED"


class UnsupportedTemplateError(AutomationError):
    """No template implementation exists for the given site_id."""
    error_type = "UNSUPPORTED_TEMPLATE"

    def __init__(self, site_id: str = "", message: str = ""):
        super().__init__(
            message or f"No template registered for site_id='{site_id}'",
            step="routing"
        )
        self.site_id = site_id
