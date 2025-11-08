# S&P 500 Sectors Data
![Update S&P 500 data](https://github.com/jsubroto/sp500-sectors-data/actions/workflows/update.yml/badge.svg)

Automatically updated dataset of S&P 500 sector weights scraped from [us500.com](https://us500.com/sp500-companies-by-sector).  
The data refreshes on weekdays via a scheduled GitHub Actions workflow.

## 📦 Data

Generated JSON files are committed to the repository under the [`data/`](data) directory:

| File | Description |
|------|-------------|
| `source-us500.json` | Raw sector data as fetched from the source site |
| `sectors.json` | Simplified data with `labels` (sector names) and `values` (percent weights) |
| `sectors-YYYY-MM-DD.json` | Archived daily snapshots (created automatically) |

Each file includes an `asOf` field indicating the UTC date of retrieval.

Example (`data/sectors.json`):

```json
{
  "asOf": "2025-10-19",
  "labels": ["Technology", "Healthcare", "Financials", "..."],
  "values": [27.5, 13.9, 12.3, "..."]
}
```

## ⚙️ Automation

This repository uses a GitHub Actions workflow that runs on weekdays (Tuesday–Saturday UTC):

- Fetches the latest data from **us500.com**
- Writes updated JSON files under data/
- Commits and pushes any changes automatically

You can also trigger it manually from the **Actions** tab.

## 🧰 Local Development

Requires Node.js 18+.


```bash
npm install
npm run fetch
```

This will regenerate the JSON files under `data/`.

## 📄 License

[MIT](LICENSE)
