#!/bin/bash
 export RWFW_PATH="/workspaces/redwood"
 mkdir -p /workspaces/rw-test-app
 cd /workspaces/rw-test-app
 echo -e "\n\n\033[94m ======================================================" && echo -e "\n\033[33m ⌛ Please wait until the dev server is running on the right-side terminal. \n "rw-test-app" is being generated & linked with latest framework code. \n\nIf you make further changes to the framework..." &&  echo -e "1. \033[33mEnsure env vars are set \033[92m'export RWFW_PATH="/workspace/redwood"'\033[33m" && echo -e "2. \033[33mRun \033[92m'yarn rwfw project:sync'\033[33m to watch & sync changes into the test project" &&  echo -e "\n\033[94m ======================================================\n\n"

export RWFW_PATH="/workspaces/redwood"
export REDWOOD_DISABLE_TELEMETRY=1
cd /workspaces/redwood
corepack enable
yarn install
yarn run build:test-project ../rw-test-app --typescript --link --verbose
cd /workspaces/rw-test-app && sed -i "s/\(open *= *\).*/\1false/" redwood.toml