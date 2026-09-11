If verification fails twice on the same task, revert to the last good commit
with git and report. Do not accumulate broken changes. Never force-push,
never discard uncommitted work belonging to the user without asking.
