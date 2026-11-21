#!/bin/sh
# Starts the API or worker as the unprivileged `node` user.
#
# The storage and backup directories may live on volumes created by an earlier
# image that ran as root, so their ownership is corrected first (only files not
# already owned by node are touched), then privileges are dropped for good.
set -e
if [ "$(id -u)" = "0" ]; then
  for dir in /app/backend/storage /app/backend/backups; do
    mkdir -p "$dir"
    find "$dir" ! -user node -exec chown node:node {} +
  done
  exec runuser -u node -- "$@"
fi
exec "$@"
