#!/bin/sh

export ONE_TARGET_PLATFORM=nodejs

MODULES="one.core"

for module in $MODULES; do
    cd "node_modules/$module"
    node build.js
    cd ../..
done

node ./build_plan_modules.js
