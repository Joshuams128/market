# DayTrade OS

Rule-based intraday signals for US stocks/ETFs and gold, with risk-based position sizing, a backtester, and (optional) Alpaca order placement. Educational software, not financial advice.

## Run it
```bash
npm install
cp .env.example .env.local   # optional: add keys
npm run dev                  # http://localhost:3000
```
With no keys it runs on **synthetic demo data** (clearly labelled in the UI) so you can click around.

## Placing your first (paper) trade
1. Create a free Alpaca **paper** account, generate paper API keys, and put them in `.env.local` as `ALPACA_KEY_ID` / `ALPACA_SECRET` (leave `ALPACA_LIVE=false`). Restart `npm run dev`.
2. The header should read **Paper trading** and **Live data: alpaca** (not DEMO DATA).
3. Orders only work while the US market is open (09:30-16:00 ET = 14:30-21:00 UK). Pick a stock/ETF with an active signal, click **Review order...**, then **Confirm**.
4. Gold (XAUUSD) is copy-to-MT5: add `TWELVEDATA_API_KEY`, click **Copy MT5 ticket** during the London window, and paste into MetaTrader 5 (check your broker's contract size and lot step first).

The order endpoint refuses to place an order when: the market is closed, the live price has moved more than 0.5R from the signal (or already crossed the stop/target), risk exceeds 2% of equity, or buying power is short. **Orders are only accepted from localhost** because the app has no login; don't deploy it publicly with broker keys unless you add your own access control (then set `ALLOW_REMOTE_ORDERS=true`).

## What it does
- **Signals**: Opening Range Breakout + VWAP/EMA Pullback on 5-min bars. Each signal has an entry, a stop (0.5–2× ATR), a 2R target, and a rule-checklist score (not a probability).
- **Sizing**: shares = (balance × risk%) ÷ stop distance, capped by max position %. Gold shows MT5 lots (1 lot = 100 oz; confirm your broker's contract size).
- **Gold (XAU/USD)**: price from Twelve Data; one tap copies `BUY/SELL XAUUSD lots entry SL TP` for MetaTrader 5. London-open session windows.
- **Stocks/ETFs (incl. GLD)**: data + bracket orders via Alpaca. **Paper by default.**
- **Backtest**: last 30 days, 2 bps slippage per side, stop assumed first if a bar touches both levels.
- **Explain** (optional): Claude explains a signal in plain English. Pay-per-token API key from console.anthropic.com. Signals never depend on it.

## Safety rails
- Server rejects orders risking > 2% of equity, bad stop/target geometry, or > buying power.
- Live trading needs `ALPACA_LIVE=true` **and** a confirm click. Keep it off until you've paper traded for weeks.
- Treat any backtest with < ~100 trades as noise. Costs matter: tight stops + slippage turn many "edges" negative.

## Next steps
Trade journal + daily loss limit (Supabase), more setups, walk-forward testing, session/news filters.
