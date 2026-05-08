#!/bin/bash
# Snooker Mate — Deploy to Cloudflare Pages
# Double-click this file in Finder to deploy.

set -e
cd "$(dirname "$0")"

echo "================================================"
echo "  Snooker Mate → Cloudflare Pages Deploy"
echo "================================================"
echo ""

# Check for wrangler
if ! command -v wrangler &>/dev/null && ! command -v npx &>/dev/null; then
  echo "ERROR: Neither wrangler nor npx found. Please install Node.js from https://nodejs.org"
  exit 1
fi

WRANGLER="npx wrangler@latest"

echo "▶ Checking Cloudflare auth..."
if ! $WRANGLER whoami &>/dev/null; then
  echo "  Not logged in. Opening browser for Cloudflare login..."
  $WRANGLER login
fi

echo "▶ Deploying to Cloudflare Pages..."
$WRANGLER pages deploy . \
  --project-name snooker-mate \
  --branch main \
  --commit-dirty=true

echo ""
echo "✅ Deploy complete!"
echo "   Your app is live at: https://snooker-mate.pages.dev"
echo ""
read -p "Press Enter to close..."
