#!/usr/bin/env bash
set -euo pipefail

WIKI_REMOTE="${WIKI_REMOTE:-https://github.com/pkistudio/certgadgets.wiki.git}"
WIKI_DIR="${WIKI_DIR:-/workspaces/certgadgets.wiki}"

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

if ! command_exists ruby || ! command_exists gem; then
  sudo apt-get update
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
    ruby-full \
    build-essential \
    zlib1g-dev \
    cmake \
    pkg-config \
    libssl-dev
fi

if ! command_exists gollum; then
  sudo gem install gollum --no-document
fi

if [ ! -d "$WIKI_DIR" ]; then
  if ! git clone "$WIKI_REMOTE" "$WIKI_DIR"; then
    cat <<EOF
Wiki repository could not be cloned from:
  $WIKI_REMOTE

If the GitHub Wiki has not been initialized yet, create the first Home page in
GitHub's Wiki tab, then rerun this script.
EOF
  fi
elif [ ! -d "$WIKI_DIR/.git" ]; then
  echo "Wiki directory exists but is not a Git repository: $WIKI_DIR"
else
  echo "Wiki repository already exists: $WIKI_DIR"
fi

echo "Gollum is ready. Run: gollum --host 0.0.0.0 --port 4567 $WIKI_DIR"