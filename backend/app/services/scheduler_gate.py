"""Whether a background scheduler will run, and why -- as a value, not a return.

The lifecycle email scheduler sat enabled in app_settings for two weeks and
sent nothing. `lifecycle_email_sends` was empty while 34 actors sat inside the
eligible window, and nothing anywhere said why. Every way the thread declines
to start was a bare `return`, and a run with nothing to do logged nothing
either, so a dead scheduler and an idle one produced identical output: none.

This makes the decision inspectable and forces the caller to log it. It cannot
by itself make a scheduler run -- if ENVIRONMENT is not set to production on the
host, the answer is still no -- but it says so out loud.
"""

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class SchedulerStatus:
    """Will it run, and the sentence to put in the log either way."""

    name: str
    will_run: bool
    reason: str


def scheduler_status(
    name: str, *, environment: Optional[str], flag: Optional[str]
) -> SchedulerStatus:
    """Decide whether the `name` scheduler should start.

    `environment` is the ENVIRONMENT variable, `flag` the per-scheduler kill
    switch (`<NAME>_ENABLED`). Both are passed in rather than read here so the
    decision is testable without touching the process environment.
    """
    env = (environment or "").strip().lower()
    if not env:
        return SchedulerStatus(
            name, False,
            f"{name} scheduler NOT started: ENVIRONMENT is unset "
            f"(it must be 'production')",
        )
    if env != "production":
        return SchedulerStatus(
            name, False,
            f"{name} scheduler NOT started: ENVIRONMENT is {env!r}, "
            f"not 'production'",
        )
    if (flag or "").strip().lower() == "false":
        return SchedulerStatus(
            name, False,
            f"{name} scheduler NOT started: {name.upper()}_ENABLED=false",
        )
    return SchedulerStatus(name, True, f"{name} scheduler started")
