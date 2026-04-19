#!/bin/bash
# Bump version across all relevant files
# Usage: ./scripts/bump-version.sh [patch|minor|major|beta] [--dry-run]

set -e

KIND=${1:-patch}
DRY_RUN=false
if [[ "$2" == "--dry-run" ]]; then
  DRY_RUN=true
fi

# Get current version from package.json
OLD_VERSION=$(grep -E '"version": "[^"]+"' package.json | grep -oE '[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9]+)?' | head -1)

# Parse version and optional pre-release
if [[ "$OLD_VERSION" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)(.*) ]]; then
  MAJOR=${BASH_REMATCH[1]}
  MINOR=${BASH_REMATCH[2]}
  PATCH=${BASH_REMATCH[3]}
  PRERELEASE=${BASH_REMATCH[4]}
else
  echo "Cannot parse version: $OLD_VERSION"
  exit 1
fi

# Increment version
case $KIND in
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    PRERELEASE=""
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    PRERELEASE=""
    ;;
  patch)
    if [[ -n "$PRERELEASE" ]]; then
      PATCH=$((PATCH + 1))
      PRERELEASE=""
    else
      PATCH=$((PATCH + 1))
    fi
    ;;
  beta)
    if [[ -z "$PRERELEASE" ]]; then
      PRERELEASE="-beta0"
    else
      if [[ "$PRERELEASE" =~ ^-beta([0-9]+)$ ]]; then
        BETA_NUM=${BASH_REMATCH[1]}
        PRERELEASE="-beta$((BETA_NUM + 1))"
      else
        PRERELEASE="-beta0"
      fi
    fi
    ;;
  *) echo "Invalid kind: $KIND (use: patch, minor, major, beta)"; exit 1 ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH$PRERELEASE"

echo "Bumping version: $OLD_VERSION -> $NEW_VERSION"

# Update package.json
sed -i '' "s/\"version\": \"$OLD_VERSION\"/\"version\": \"$NEW_VERSION\"/" package.json

# Update Cargo.toml (workspace.package.version)
sed -i '' "s/^version = \"$OLD_VERSION\"$/version = \"$NEW_VERSION\"/" Cargo.toml

# Update src-tauri/tauri.conf.json
sed -i '' "s/\"version\": \"$OLD_VERSION\"/\"version\": \"$NEW_VERSION\"/" src-tauri/tauri.conf.json

if $DRY_RUN; then
  echo "[dry-run] Skipping git operations"
  exit 0
fi

echo ""
echo "Committing and tagging..."

git add Cargo.lock
git add -A
git commit -m "chore: bump version to v$NEW_VERSION"
git tag "v$NEW_VERSION"
git push && git push --tags

echo ""
echo "Released v$NEW_VERSION!"
