# Business Logic Audit — analyseJsonTable

## What the algorithm does

For each pair of consecutive rows `(data[i], data[i+1])` starting at `i = 1`:
- Tracks `firstPrice` — the entry price at the start of the current signal run
- When the signal changes, calculates profit based on the exited signal, pushes to `globalProfit[]`, and resets `firstPrice = data[i+1].price`

---

## Issues found

### 1. First data row is silently discarded

The loop starts at `i = 1`, and `firstPrice` is set from `data[1].price`. `data[0]` is never read.

If the recording starts at:
```
data[0]: BUY @ 90   ← ignored
data[1]: BUY @ 100  ← firstPrice = 100  (entry price used)
data[2]: SELL @ 110 ← signal change, exit at 100 (lastPrice = data[1].price)
```

The algorithm records entry at 100, not 90. If the run actually started at 90, the profit is underestimated. **The first data point is wasted.**

**Practical impact:** minor — one tick of data is lost at the start of each recording session.

---

### 2. Exit price is one tick behind the signal change

When the signal changes at index `i` (from signal X at `data[i]` to signal Y at `data[i+1]`):
- **Exit price:** `data[i].price` — the last price *before* the change
- **Entry price of new run:** `data[i+1].price` — the first price *of* the new signal

In reality, you see the signal change at the close of period `i` and would execute the trade at period `i+1`'s open/price. So:
- Closing the old position at `data[i].price` ✓ (reasonable)
- Opening the new position at `data[i+1].price` ✓ (reasonable)

**Conclusion:** this part is acceptable for a simulation. The trade happens at the moment of signal change, which is a standard simplification.

---

### 3. Open positions at end of data are not counted

If the signal never changes again before the data ends, the last open position's unrealized profit/loss is silently ignored.

Example: BUY from 100, data ends at 200, no SELL signal ever → profit = 0 (not +100).

This is a **significant underestimation of returns** for strategies that stay in a position for the duration of a recording. The current `console.warn` message ("no change of signal") surfaces this case for fully unchanged files, but not for runs that end mid-position.

**Fix needed:** at the end of the loop, if `firstPrice` is defined and a position is open, calculate the unrealized profit using the last data point's price.

---

### 4. NEUTRAL is treated as "no position" but profit is calculated against firstPrice

When the signal is NEUTRAL and then changes:
```ts
case 'NEUTRAL':
    profit = 0
    break
```

Profit is hardcoded to 0 regardless of price movement. This is correct *if* the interpretation is "we hold no position during NEUTRAL". But `firstPrice` is still updated normally (`firstPrice = nextRow.price`). So the next signal run correctly starts fresh. ✓

---

### 5. No transaction costs or slippage

The model assumes you can enter and exit at the exact close price at the moment of signal change, with zero fees. Real exchange fees are typically 0.1%–0.5% per trade (maker/taker). On frequent signal changes, fees accumulate and can turn a theoretical profit into a practical loss.

**Not a code bug**, but a known limitation of the simulation model.

---

### 6. Leverage model is simplistic

`STRONG BUY` doubles the profit (×2) and `STRONG SELL` doubles the short profit (×2). This assumes a fixed leverage position of exactly 2× on the same notional. In practice, ×2 leverage also doubles losses and incurs funding rates on perpetual futures.

**Not a code bug**, but worth noting for users interpreting the output.

---

### 7. absoluteFirstPrice can be undefined when calculating the variation

```ts
const profitVariation = (profitSum / absoluteFirstPrice!) * 100
```

`absoluteFirstPrice` is set from `data[1].price`. If `data[1].price` is `undefined` (which `TickerRow.price` now allows), the division produces `NaN`. The non-null assertion was removed in the refactor but the guard (`if(firstPrice === undefined) continue`) skips the iteration without setting `absoluteFirstPrice`.

**Fix needed:** validate that `absoluteFirstPrice` is a valid number before computing `profitVariation`, and return `undefined` or `'N/A%'` if it is not.

---

## Summary

| # | Issue | Severity | Affects correctness |
|---|---|---|---|
| 1 | First row discarded | Low | Minor undercount |
| 2 | Exit one tick behind | Low | Acceptable simplification |
| 3 | Open position at end of data ignored | **High** | Can significantly understate returns |
| 4 | NEUTRAL = 0 profit | None | Correct by design |
| 5 | No fees/slippage | Medium | Overstates real-world returns |
| 6 | Leverage model is simplified | Low | Overstates levered returns |
| 7 | absoluteFirstPrice can be undefined | Medium | Produces NaN in output |
