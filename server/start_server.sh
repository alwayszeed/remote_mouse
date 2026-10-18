#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
echo "Starting Remote Mouse Server..."
python3 "$DIR/server.py" "$@"
