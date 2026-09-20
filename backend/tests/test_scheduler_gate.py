"""Why a background scheduler did or did not start.

The lifecycle email scheduler sat switched on in app_settings for two weeks and
sent nothing: `lifecycle_email_sends` was empty while 34 people sat eligible.
It could not be diagnosed from the outside, because every way it declines to
run was a bare `return`, and a run with nothing to do logged nothing either. A
dead scheduler and an idle one looked identical.

So the decision is a value now, and it is always stated.
"""

from app.services.scheduler_gate import scheduler_status


def test_it_will_not_run_outside_production():
    s = scheduler_status("lifecycle", environment="development", flag=None)
    assert s.will_run is False
    assert "development" in s.reason


def test_an_explicit_false_flag_stops_it():
    s = scheduler_status("lifecycle", environment="production", flag="false")
    assert s.will_run is False
    assert "LIFECYCLE_ENABLED=false" in s.reason


def test_production_with_no_flag_runs():
    s = scheduler_status("lifecycle", environment="production", flag=None)
    assert s.will_run is True


def test_the_environment_check_is_case_and_space_tolerant():
    assert scheduler_status("lifecycle", environment=" Production ", flag=None).will_run


def test_a_missing_environment_reads_as_not_production():
    s = scheduler_status("lifecycle", environment=None, flag=None)
    assert s.will_run is False
    assert "unset" in s.reason


def test_the_reason_always_names_the_scheduler():
    for env, flag in [("development", None), ("production", "false"), ("production", None)]:
        assert "lifecycle" in scheduler_status("lifecycle", environment=env, flag=flag).reason
