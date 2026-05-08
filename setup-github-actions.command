#!/bin/bash
# Snooker Mate — Set up GitHub Actions auto-deploy
# Double-click this in Finder to run.

set -e
cd "$(dirname "$0")"

echo "================================================"
echo "  Snooker Mate → GitHub Actions CI/CD Setup"
echo "================================================"
echo ""

# Check for required tools
for tool in npx gh; do
  if ! command -v $tool &>/dev/null; then
    echo "ERROR: '$tool' not found."
    if [ "$tool" = "gh" ]; then
      echo "Install GitHub CLI: brew install gh"
    fi
    exit 1
  fi
done

# Get Cloudflare API token from wrangler config
WRANGLER_CONFIG="$HOME/.wrangler/config/default.toml"
CF_TOKEN=""

if [ -f "$WRANGLER_CONFIG" ]; then
  CF_TOKEN=$(grep -o 'oauth_token = "[^"]*"' "$WRANGLER_CONFIG" 2>/dev/null | cut -d'"' -f2)
  if [ -z "$CF_TOKEN" ]; then
    CF_TOKEN=$(grep -o 'api_token = "[^"]*"' "$WRANGLER_CONFIG" 2>/dev/null | cut -d'"' -f2)
  fi
fi

if [ -z "$CF_TOKEN" ]; then
  echo "Could not auto-read Cloudflare token from wrangler config."
  echo "Getting a fresh token via wrangler..."
  CF_TOKEN=$(npx wrangler@latest whoami 2>&1 | grep -o 'token: [^ ]*' | cut -d' ' -f2 || true)
fi

if [ -z "$CF_TOKEN" ]; then
  echo ""
  echo "Please paste your Cloudflare API token (from dash.cloudflare.com → My Profile → API Tokens):"
  read -r CF_TOKEN
fi

# Get Cloudflare Account ID
CF_ACCOUNT_ID="a03800d1b7c787c163393a52af89accb"

echo "▶ Setting GitHub secrets on kaspersky167/Snooker-mate..."
gh secret set CLOUDFLARE_API_TOKEN --body "$CF_TOKEN" --repo kaspersky167/Snooker-mate
gh secret set CLOUDFLARE_ACCOUNT_ID --body "$CF_ACCOUNT_ID" --repo kaspersky167/Snooker-mate

echo "✅ Secrets set!"
echo ""
echo "▶ Creating GitHub Actions workflow file..."

mkdir -p .github/workflows
cat > .github/workflows/deploy.yml << 'WORKFLOW'
name: Deploy to Cloudflare Pages

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    name: Deploy
    steps:
      - uses: actions/checkout@v4
      - name: Run tests
        run: node tests/scoring.test.js
      - name: Deploy to Cloudflare Pages
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy . --project-name snooker-mate --branch main
WORKFLOW

echo "▶ Committing and pushing workflow..."
git add .github/workflows/deploy.yml
git commit -m "Add GitHub Actions deploy to Cloudflare Pages"
git push origin main

echo ""
echo "✅ Done! GitHub Actions will now auto-deploy on every push to main."
echo "   Watch the deploy at: https://github.com/kaspersky167/Snooker-mate/actions"
echo "   Live site: https://snooker-mate.pages.dev"
echo ""
read -p "Press Enter to close..."
