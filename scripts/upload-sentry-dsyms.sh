#!/bin/sh

set -eu

# Debug builds do not produce the release symbols Sentry needs.
if [ "${CONFIGURATION:-}" != "Release" ]; then
  [ -n "${SCRIPT_OUTPUT_FILE_0:-}" ] && touch "$SCRIPT_OUTPUT_FILE_0"
  exit 0
fi

repo_root=$(cd "${SRCROOT}/../.." && pwd)

# Xcode launched from Finder does not inherit variables exported in ~/.zshrc.
# Reuse the same gitignored file Vite reads for source-map uploads.
if [ -f "${repo_root}/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "${repo_root}/.env"
  set +a
fi

if [ -z "${SENTRY_AUTH_TOKEN:-}" ] || [ -z "${SENTRY_ORG:-}" ] || [ -z "${SENTRY_PROJECT:-}" ]; then
  if [ "${ACTION:-}" = "install" ]; then
    echo "error: Sentry upload credentials are missing. Add SENTRY_AUTH_TOKEN, SENTRY_ORG, and SENTRY_PROJECT to ${repo_root}/.env before archiving."
    exit 1
  fi

  echo "warning: Skipping Sentry dSYM upload because build credentials are missing."
  [ -n "${SCRIPT_OUTPUT_FILE_0:-}" ] && touch "$SCRIPT_OUTPUT_FILE_0"
  exit 0
fi

sentry_cli="${repo_root}/node_modules/.bin/sentry-cli"
if [ ! -x "$sentry_cli" ]; then
  echo "error: sentry-cli is missing. Run npm install before archiving."
  exit 1
fi

if [ ! -d "${DWARF_DSYM_FOLDER_PATH:-}" ]; then
  echo "error: Xcode did not provide a dSYM folder for this Release build."
  exit 1
fi

"$sentry_cli" debug-files upload \
  --org "$SENTRY_ORG" \
  --project "$SENTRY_PROJECT" \
  --type dsym \
  "$DWARF_DSYM_FOLDER_PATH"

[ -n "${SCRIPT_OUTPUT_FILE_0:-}" ] && touch "$SCRIPT_OUTPUT_FILE_0"
