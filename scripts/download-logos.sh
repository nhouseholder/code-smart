#!/usr/bin/env bash
set -e
DIR="$(dirname "$0")/../public/logos"
mkdir -p "$DIR"

# slug:filename pairs (CDN slug may differ from local filename)
declare -a PAIRS=(
  "anthropic:anthropic"
  "openai:openai"
  "google:google"
  "github:github"
  "meta:meta"
  "mistralai:mistral"
  "deepseek:deepseek"
)

for pair in "${PAIRS[@]}"; do
  slug="${pair%%:*}"
  name="${pair##*:}"
  file="$DIR/$name.svg"
  if [ ! -f "$file" ]; then
    curl -sf "https://cdn.simpleicons.org/$slug" -o "$file" && echo "Downloaded $name.svg" || echo "Warning: failed to download $name.svg ($slug)"
  fi
done
