#!/bin/sh
cd "${SRCROOT}/../.." && node scripts/patch-ios-audio-plugin.mjs
touch "${DERIVED_FILE_DIR}/capacitor-local-plugins.stamp"

