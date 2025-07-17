#!/bin/bash
# Wrapper for supervisorctl to suppress deprecation warnings

export PYTHONWARNINGS="ignore::DeprecationWarning,ignore::UserWarning"

# Filter out pkg_resources warnings
exec supervisorctl "$@" 2> >(grep -v "pkg_resources is deprecated" >&2)
