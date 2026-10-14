#!/bin/sh
exec node "$(dirname "$0")/scripts/cli.ts" "$@"
