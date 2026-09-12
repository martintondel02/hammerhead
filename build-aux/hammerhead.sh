#!/bin/sh
# Hammerhead launcher: runs the bundled Electron runtime with the app resources.
exec /app/hammerhead/electron --no-sandbox --disable-gpu-sandbox "$@"