# S&P 500 Sectors Data
![Update S&P 500 data](https://github.com/jsubroto/sp500-sectors-data/actions/workflows/update.yml/badge.svg)

Automatically updated dataset of S&P 500 sector weights, built from the daily holdings of the [iShares Core S&P 500 ETF (IVV)](https://www.ishares.com/us/products/239726/ishares-core-s-p-500-etf), with each company's industry from Wikipedia's [List of S&P 500 companies](https://en.wikipedia.org/wiki/List_of_S%26P_500_companies).  
The data refreshes on weekdays via a scheduled GitHub Actions workflow.

## 📦 Data

Generated JSON files are committed to the repository under the [`data/`](data) directory:

| File | Description |
|------|-------------|
| `source-us500.json` | Every company grouped by sector, with `rank`, `name`, `ticker`, `weight`, `sector` and `industry`. The name dates from when the data came from us500.com and is kept so existing consumers don't break. |
| `sectors.json` | Simplified data with `labels` (sector names) and `values` (percent weights) |

Each file includes an `asOf` field with the date of the fund holdings it was built from.

Example (`data/sectors.json`):

```json
{
  "asOf": "2026-10-29",
  "labels": ["Information Technology", "Financials", "Health Care", "..."],
  "values": ["38.40", "12.05", "10.02", "..."]
}
```

### How the numbers are calculated

- **Weights** are each stock's market value divided by the total market value of the fund's stocks. Cash, futures and other non-stock holdings are left out, so the weights add up to 100%.
- **Sector weights** are the sum of the company weights in each sector.
- **Industry** is the GICS Sub-Industry from Wikipedia, matched by ticker. A company Wikipedia doesn't list yet gets an empty `industry` until it's added there.

## ⚙️ Automation

This repository uses a GitHub Actions workflow that runs on weekdays (Monday–Friday, 21:30 UTC):

- Fetches the latest holdings from **iShares** and the company list from **Wikipedia**
- Writes updated JSON files under data/
- Commits and pushes when the data changed, and skips the commit when the holdings haven't been updated (for example on market holidays)

The run fails without committing anything if the data looks wrong: fewer than 490 or more than 520 stocks, stocks making up less than 99% of the fund, holdings more than 7 days old, more than 5% of tickers missing from Wikipedia, or a name or industry containing `<` or `>`. Since anyone can edit Wikipedia, that last check keeps HTML out of the data.

You can also trigger it manually from the **Actions** tab.

## 🧰 Local Development

Requires Node.js 18+.


```bash
npm install
npm run fetch
```

This will regenerate the JSON files under `data/`.

## 🧪 Tests

```bash
npm test
```

Runs the Node built-in test runner against the parsers and `buildOutputs`,
asserting the output schema, that weights add up to 100%, which holdings are
kept, and the guards that throw when a source changes shape. Tests run offline
against small, real slices of both sources in
[`scripts/__fixtures__/`](scripts/__fixtures__), so no network call is needed.

Re-capture those fixtures (reduced slices of a live fetch) when iShares or
Wikipedia changes its format and the parsing has been updated to match:

```bash
npm run capture-fixture
```

## 📄 License

[MIT](LICENSE)
