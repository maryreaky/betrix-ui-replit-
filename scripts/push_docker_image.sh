#!/usr/bin/env bash
set -euo pipefail

# Push Docker image to a registry (Docker Hub by default)
# Usage:
#  DOCKERHUB_USERNAME=youruser DOCKERHUB_TOKEN=yourtoken ./scripts/push_docker_image.sh

IMAGE="adminoroo/betrix-ui-new:latest"

if [ -z "${DOCKERHUB_USERNAME:-}" ] || [ -z "${DOCKERHUB_TOKEN:-}" ]; then
  echo "DOCKERHUB_USERNAME and DOCKERHUB_TOKEN must be set"
  exit 1
fi

echo "Logging into Docker Hub as $DOCKERHUB_USERNAME"
echo "$DOCKERHUB_TOKEN" | docker login -u "$DOCKERHUB_USERNAME" --password-stdin

echo "Building $IMAGE"
docker build -t "$IMAGE" .

echo "Pushing $IMAGE"
docker push "$IMAGE"

echo "Done."
