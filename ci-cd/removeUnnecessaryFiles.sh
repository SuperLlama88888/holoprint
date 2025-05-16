#!/bin/bash

rm *.md
rm assets/*.gif
rm -r ci-cd
rm -r supabase
rm -r data/schemas
rm -rf .*
keys=$(jq -r '.inputs | keys[]' "esbuild_meta.json")
cd tests
for key in $keys; do
if [ "$key" != "../index.js" ]; then
	rm "$key"
fi
done
cd ..
rm esbuild_meta.json
tree -f