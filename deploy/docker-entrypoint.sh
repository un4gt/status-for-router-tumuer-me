#!/bin/sh
set -eu

if [ "$(id -u)" = "0" ]; then
    # Bind mounts are available now, so initialize the mounted directory.
    mkdir -p /app/data
    chown bun:bun /app/data
    chmod 0750 /app/data
    exec setpriv --reuid=bun --regid=bun --init-groups "$@"
fi

exec "$@"
