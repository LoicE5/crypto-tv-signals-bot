# Changelog

## 1.0.0 — 2026-03-14

### Added
- `install:chrome` package script to install Chrome via Puppeteer's CLI
- Argument validation in `index.ts`: exits with an error if no command or an unknown command is provided

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
