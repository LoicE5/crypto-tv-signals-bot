# Crypto TV Signal Bot

> **Alpha** — Missing features, use at your own risk. Contributions are welcome.

This tool uses Puppeteer to scrape [TradingView's Technical Analysis Widget](https://www.tradingview.com/widget/technical-analysis/) and report signals for cryptocurrency pairs.

Three commands are available:

- **simulate** — Print the current price and TradingView signal for a pair at regular intervals
- **write** — Record price and signal data over time into a `.ndjson` file (one JSON object per line — always valid, safe through crashes)
- **analyze** — Estimate ROI from a previously written `.ndjson` file, based on the following strategy:
  - `STRONG BUY` → long x2
  - `BUY` → long x1
  - `NEUTRAL` → exit market
  - `SELL` → short x1
  - `STRONG SELL` → short x2

  An `--inverted` flag reverses all positions.

---

## Setup

Install dependencies:

```bash
bun install
```

Install Chrome (stored in `~/.cache/puppeteer`, shared across projects):

```bash
bun run install:chrome
```

---

## Usage

### simulate

Print price and signal for a pair on a 1-second loop:

```bash
# BTC/USDT on the 1-minute interval (default)
bun start simulate --pair=BTCUSDT

# ETH/USDT on the 4-hour interval
bun start simulate --pair=ETHUSDT --interval=4h

# SOL/USDT on the daily interval
bun start simulate --pair=SOLUSDT --interval=1D

# BNB/USDT on the weekly interval
bun start simulate --pair=BNBUSDT --interval=1W
```

### write

Record price and signal to a `.ndjson` file in `./output/` (NDJSON — one JSON object per line):

```bash
# BTC/USDT every 10 seconds (default delay), 1-minute interval
bun start write --pair=BTCUSDT

# ETH/USDT every 30 seconds on the 15-minute interval
bun start write --pair=ETHUSDT --interval=15m --delay=30

# ADA/USDT every 5 minutes on the 1-hour interval
bun start write --pair=ADAUSDT --interval=1h --delay=300

# BTC/USDT every 60 seconds on the 4-hour interval
bun start write --pair=BTCUSDT --interval=4h --delay=60

# XRP/USDT every 2 minutes on the daily interval
bun start write --pair=XRPUSDT --interval=1D --delay=120
```

### analyze

Estimate profit from a previously written file:

```bash
# Standard strategy
bun start analyze --path=./output/BTCUSDT_1m_14-3-2026.ndjson

# Inverted strategy (short on BUY, long on SELL)
bun start analyze --path=./output/BTCUSDT_1m_14-3-2026.ndjson --inverted

# Absolute path
bun start analyze --path=/home/user/data/ETHUSDT_4h_1-1-2026.ndjson

# Inverted with flag=true syntax
bun start analyze --path=./output/SOLUSDT_1D_14-3-2026.ndjson --inverted=true
```

---

## Arguments

| Option | Commands | Description | Allowed values | Default |
|---|---|---|---|---|
| `--pair` | simulate, write | Cryptocurrency pair | Any valid Binance pair (e.g. `BTCUSDT`, `ETHDAI`) | required |
| `--interval` | simulate, write | TradingView analysis interval | `1m` `5m` `15m` `30m` `1h` `2h` `4h` `1D` `1W` `1M` | `1m` |
| `--delay` | write | Seconds between each fetch and write | Any number — below 1 or above 600 is not recommended | `10` |
| `--path` | analyze | Path to a `.ndjson` file to analyze | Any valid file path | required |
| `--inverted` | analyze | Invert all positions (short on BUY, long on SELL) | flag or `=true` | `false` |

---

## Development

Run with hot-reload on file save:

```bash
bun run dev simulate --pair=BTCUSDT --interval=1m
```

Other available commands:

```bash
bun test              # Run the test suite
bun run lint          # Run ESLint
bun run typecheck     # Type-check with tsc (no emit)
bun run build         # Build Linux binaries (x64 + arm64) to ./dist/
bun run build:x64     # Build x64 binary only
bun run build:arm64   # Build arm64 binary only
```

---

## Contribute

Clone the repo and open a pull request. Any contribution is appreciated.