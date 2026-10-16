#!/usr/bin/env bash
# QueueC installer: clones the repo, builds the Docker image, and starts a
# container with a persistent data directory.
#
#   curl -fsSL https://raw.githubusercontent.com/jovenpaoloangeles/QueueC/master/install.sh | bash
#
# Config (all optional):
#   QUEUEC_DIR       where to install (default: ./queuec)
#   PORT             host port          (default: 3001)
#   QUEUEC_CONTAINER container name     (default: queuec)
#   REPO_URL         clone from elsewhere (e.g. your fork)
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/jovenpaoloangeles/QueueC.git}"
QUEUEC_DIR="${QUEUEC_DIR:-$PWD/queuec}"
PORT="${PORT:-3001}"
QUEUEC_CONTAINER="${QUEUEC_CONTAINER:-queuec}"

command -v docker >/dev/null || {
  echo "docker not found — install Docker first: https://docs.docker.com/get-docker/" >&2
  exit 1
}
docker info >/dev/null 2>&1 || { echo "docker daemon is not running" >&2; exit 1; }

mkdir -p "$QUEUEC_DIR"
if [ ! -d "$QUEUEC_DIR/repo/.git" ]; then
  echo "Cloning QueueC into $QUEUEC_DIR/repo"
  git clone --depth 1 "$REPO_URL" "$QUEUEC_DIR/repo"
else
  git -C "$QUEUEC_DIR/repo" pull --ff-only --quiet
fi

echo "Building image (first run takes a couple of minutes)..."
docker build -t queuec "$QUEUEC_DIR/repo"

mkdir -p "$QUEUEC_DIR/data"
if [ ! -f "$QUEUEC_DIR/data/players.json" ]; then
  cp "$QUEUEC_DIR/repo/players.example.json" "$QUEUEC_DIR/data/players.json"
  echo "Seeded $QUEUEC_DIR/data/players.json from the example roster."
  echo "Edit it now, or manage players in the app after first boot."
fi

# reinstall-safe: replace a previous container of the same name
docker rm -f "$QUEUEC_CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$QUEUEC_CONTAINER" \
  --restart unless-stopped \
  -p "$PORT:3001" \
  -v "$QUEUEC_DIR/data:/data" \
  queuec >/dev/null

echo
echo "QueueC is running at http://localhost:$PORT"
echo "Persistent data (SQLite db + players.json): $QUEUEC_DIR/data"
echo "Update later by re-running this script."
