# Changelog

## 1.2.0 — 2026-03-19

### Added
- Interactive CLI via `@clack/prompts`: launched when the program is run with no arguments
- Arrow-navigable menus to choose command (simulate / write / analyze), pair, interval, delay, and .ndjson file
- Recursive `.ndjson` file discovery (`Bun.Glob`) for the analyze command, excluding `node_modules`
- `src/cli.ts`: all prompt logic and `discoverNdjsonFiles` utility (exported for testing)
- 6 new unit tests in `test/cli.test.ts` covering `discoverNdjsonFiles` behaviour

### Changed
- `src/index.ts`: when run without arguments the interactive CLI starts; with arguments the behavior is unchanged

## 1.1.1 - 2026-03-19

### Added
- `docker/Dockerfile`: minimal Bun Alpine image with system Chromium for Puppeteer; copies only runtime files
- `docker/docker-compose.yaml`: Compose service using the Docker image; maps `docker/volumes/output` to `/app/output`
- `docker/volumes/output/.gitkeep`: placeholder so the volume directory is tracked in git
- `docker:build` script: builds the Docker image tagged `loice5/crypto-tv-signals-bot:1.1.0`
- `docker:up` script: starts the Compose stack (non-detached)
- `.github/workflows/docker-publish.yaml`: CI workflow to build and push multi-arch image (`amd64`/`arm64`) to Docker Hub on version tags or manual dispatch
- `PUPPETEER_NO_SANDBOX` env var support in `index.ts`: passes `--no-sandbox` to Chromium when set to `true` (required in Docker)

## 1.1.0 — 2026-03-19

### Fixed
- `analyseJsonTable`: open positions at end of file are now closed at the last available price instead of being silently dropped (was a HIGH-severity bug that understated returns)
- `analyseJsonTable`: `absoluteFirstPrice` division is now guarded against `undefined`/`0` to prevent `NaN` in the `var` field
- `analyseJsonTable`: `currentSignal` is tracked across the loop so the correct position type is used for the EOF close

### Added
- `EXCHANGE_FEES` constant in `src/constants.ts`: maps exchange ids (`binance`, `bybit`, `okx`, `kraken`, `coinbase`, `kucoin`, `bitfinex`) to their typical spot taker fee rate
- `analyseJsonTable` now accepts an optional `feeRate` parameter (default: fee for the globally configured exchange — Binance 0.1%) and deducts round-trip fees from each trade's profit
- Internal `calculateSignalProfit` helper to unify profit and fee logic across both in-loop and EOF close paths
- New unit tests: EOF position close, fee deduction, two-row insufficient-data edge case

## 1.0.0 — 2026-03-14

### Added
- `install:chrome` package script to install Chrome via Puppeteer's CLI
- Argument validation in `index.ts`: exits with an error if no command or unknown command is provided; required args (`--pair`, `--path`) validated with clear error messages
- `src/interfaces.ts`: `SignalValue`, `TickerRow`, `AnalysisResult` types shared across the codebase
- `typecheck` script: runs `tsc --noEmit` for type-checking without emitting files
- `build:x64` and `build:arm64` scripts: produce self-contained Linux binaries via `bun build --compile`
- GitHub Actions workflow: builds and releases binaries on push to `master`
- `protobufjs` dependency (required by ccxt for dYdX/MEXC exchange modules)
- Business logic audit report (`OUTPUT.md`)

### Changed
- Migrated runtime from Node.js to Bun
- Replaced `npm` with `bun` for all package management and scripts
- Replaced `ts-node` + `tsc` watch + `nodemon` dev workflow with `bun --watch`
- Upgraded ccxt to 4.5.43 and puppeteer to 24.39.1
- Upgraded all dev dependencies (ESLint 9, TypeScript 5.9, @typescript-eslint 8)
- Added ESLint configuration
- Moved tests from `src/__tests__/` to `test/`
- Applied consistent code style: `function` keyword for named functions, `.at()` for array/string access, `catch(error: unknown)` throughout, `console.info`/`console.error`/`console.warn` instead of `console.log`
- Fixed `fs` callback error parameter typing (`NodeJS.ErrnoException | null`)
- Removed `basic-ftp`, `semver`, `minimatch`, `tar-fs`, `brace-expansion` overrides (no longer needed with updated deps)
- Reduced overrides to `yauzl: ^3.2.1` only (fixes moderate CVE in `extract-zip` transitive dependency)
- Replaced Node.js `fs` APIs with Bun native equivalents: `Bun.write()`, `Bun.file().text()`, `node:fs/promises` `mkdir`
- Replaced broken JSONC append format with NDJSON (one JSON object per line): always valid, crash-safe
- Output file extension changed from `.jsonc` to `.ndjson`
- `readJsoncOutputFile` replaced by `readOutputFile` with NDJSON parser
- `replaceTrailingCommaFromJsonString` removed (no longer needed)
- `isNull`: fixed loose `==` equality to strict `===` (0 and false no longer incorrectly treated as null-like)
- `getValueFromArgv`: returns `string | null` instead of `string | boolean`; uses `startsWith` to prevent partial argument name matches
- `analyseJsonTable`: returns `AnalysisResult | undefined` with proper types; removed non-null assertions; `console.warn` message corrected
- `logJsonTable`: `setInterval` body wrapped in try/catch; uses `TickerRow` type
- `getIndicator`: returns `SignalValue` type
- `index.ts`: `analyze` command no longer launches a browser; SIGINT handler closes browser cleanly; all string args properly null-checked
- `build` script: replaced `tsc` with `bun build --compile` for producing standalone binaries to `dist/`
- `tsconfig.json`: `outDir` set to `./build` (for type-checking only, not used in production build)
- Removed `trustedDependencies` for `ccxt` (its postinstall script is cosmetic only)
- Updated README: removed HTML tags, replaced with Markdown, updated all commands to Bun

### Fixed
- `fs` callback `error` parameter types in `tools.ts`
- Array and string access now uses `.at()` throughout (`DOMTokenList.item()` in page evaluation)

---

## 2025-04-13

### Security
- Bumped `braces` from 3.0.2 to 3.0.3 (ReDoS fix)
- Bumped `tar-fs` and `puppeteer` (security patches)

---

## 2023-09-30

### Fixed
- TradingView signal element selector logic reworked after upstream widget change
- Optimized Chromium launch options and DOM access pattern

---

## 2022-09-10

### Fixed
- Updated TradingView CSS selector after widget change on their side

---

## 2022-06-23

### Added
- Output directory is now created automatically if it does not exist
- `log` accepted as an alias for the `write` command
- Removed unused dependencies

---

## 2022-06-08 — Initial release

### Added
- TradingView Technical Analysis Widget scraping via Puppeteer
- `simulate` command: real-time price and signal console output
- `write` command: periodic logging of pair, signal, price, and UNIX timestamp to a `.jsonc` file
- `analyze` command: estimated ROI calculation from a `.jsonc` log file, with optional `--inverted` flag
- Exchange price fetching via ccxt (Binance by default)
- File utilities: `writeFile`, `appendFile`, `readFile`, `readJsonFile`, `readJsoncOutputFile`, `parseJsonc`
- Argument utilities: `getValueFromArgv`, `isArgv`
