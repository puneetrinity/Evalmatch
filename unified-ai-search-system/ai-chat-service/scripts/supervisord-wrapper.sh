#!/bin/bash
# Supervisor wrapper script to suppress warnings

# Suppress Python warnings
export PYTHONWARNINGS="ignore::DeprecationWarning,ignore::UserWarning"

# Redirect supervisor warnings to /dev/null but keep important logs
exec supervisord "$@" 2> >(grep -v "pkg_resources is deprecated" >&2)
