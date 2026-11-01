import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  CONSTITUENTS_URL,
  HOLDINGS_URL,
  csvRow,
  get,
  wikiRowTicker,
  wikiRows,
} from "./fetch-us500.mjs";

const HOLDINGS_TICKERS = new Set(["NVDA", "AAPL", "BRK B", "JPM", "GOOGL"]);
// Includes rows Wikipedia formats differently: a spaced template name (CBOE),
// a single leading pipe (RDDT) and several cells on one line (EME).
const CONSTITUENT_TICKERS = new Set(["NVDA", "AAPL", "BRK.B", "JPM", "GOOGL", "CBOE", "RDDT", "EME"]);

const DIR = join(import.meta.dirname, "__fixtures__");

const [holdingsRes, constituentsRes] = await Promise.all([
  get(HOLDINGS_URL),
  get(CONSTITUENTS_URL),
]);

const lines = (await holdingsRes.text()).split(/\r?\n/);
const headerIdx = lines.findIndex((l) => l.startsWith("Ticker,"));
const header = lines[headerIdx].split(",");
const type = header.indexOf("Type");
const weight = header.indexOf("Market Weight");
const holdings = [
  ...lines.slice(0, headerIdx + 1),
  ...lines.slice(headerIdx + 1).filter((l) => {
    const r = csvRow(l);
    return (
      HOLDINGS_TICKERS.has(r[0]) ||
      (r.length === header.length &&
        (r[type] !== "EQUITY" || !Number.isFinite(Number(r[weight]))))
    );
  }),
].join("\n");

const [preamble, columns, ...rows] = wikiRows(
  (await constituentsRes.json()).parse.wikitext,
);
const constituents = [
  preamble,
  columns,
  ...rows.filter((row) => CONSTITUENT_TICKERS.has(wikiRowTicker(row))).map((row) => row.replace(/\n\|\}[\s\S]*$/, "")),
].join("\n|-\n") + "\n|}\n";

await mkdir(DIR, { recursive: true });
await Promise.all([
  writeFile(join(DIR, "holdings.csv"), holdings),
  writeFile(join(DIR, "constituents.wikitext"), constituents),
]);

console.log(`Wrote ${DIR}/holdings.csv and ${DIR}/constituents.wikitext`);
