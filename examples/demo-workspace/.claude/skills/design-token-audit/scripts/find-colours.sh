#!/bin/sh
# Lists hex colours in the given folder.
grep -rnoE "#[0-9a-fA-F]{6}" "${1:-.}"
