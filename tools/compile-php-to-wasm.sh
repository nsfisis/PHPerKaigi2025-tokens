#!/bin/bash

set -eux

cd wasm
docker build -t phperkaigi2025-tokens-php-wasm .
docker create --name phperkaigi2025-tokens-php-wasm-tmp-container phperkaigi2025-tokens-php-wasm
docker cp phperkaigi2025-tokens-php-wasm-tmp-container:/src/php-wasm.js ../src/php-wasm-bridge.js
docker cp phperkaigi2025-tokens-php-wasm-tmp-container:/src/php-wasm.wasm ../public/php-wasm.wasm
docker rm phperkaigi2025-tokens-php-wasm-tmp-container
