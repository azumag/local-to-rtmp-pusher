#!/bin/bash

if [ "$CONTROLLER_MODE" = "simple" ]; then
  echo "Starting simple stream controller..."
  node /app/scripts/stream-controller-simple.js
else
  echo "Starting dynamic stream controller..."
  node /app/scripts/stream-controller.js
fi