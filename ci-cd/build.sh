#!/bin/bash
set -e

# Add production constants
sed -i "s/const VERSION = \"dev\";/const VERSION = \"${1:-testing}\";/g" HoloPrint.js
sed -i "s/const IN_PRODUCTION = false;/const IN_PRODUCTION = true;/g" index.js

# Bundle and minify
cd ci-cd
npm ci
node bundleAndMinify.js
cd ..

# Remove unnecessary files
bash ci-cd/removeUnnecessaryFiles.sh
