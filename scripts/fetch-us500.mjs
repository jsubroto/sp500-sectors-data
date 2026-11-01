import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { argv } from "node:process";
import { fileURLToPath } from "node:url";

export const HOLDINGS_URL =
  "https://www.ishares.com/us/products/239726/ishares-core-s-p-500-etf/latest-holdings.csv";
export const CONSTITUENTS_URL =
  "https://en.wikipedia.org/w/api.php?action=parse&page=List_of_S%26P_500_companies&prop=wikitext&section=1&format=json&formatversion=2";
const USER_AGENT =
  "sp500-sectors-data (https://github.com/jsubroto/sp500-sectors-data)";
const OUT_DIR = "data";

const SECTORS = new Set([
  "Communication Services",
  "Consumer Discretionary",
  "Consumer Staples",
  "Energy",
  "Financials",
  "Health Care",
  "Industrials",
  "Information Technology",
  "Materials",
  "Real Estate",
  "Utilities",
]);
const SECTOR_ALIASES = { Communication: "Communication Services" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MIN_HOLDINGS = 490;
const MAX_HOLDINGS = 520;
const MIN_STOCK_WEIGHT = 99;
const MAX_AGE_DAYS = 7;
const MAX_UNMATCHED_SHARE = 0.05;

export async function get(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res;
}

export function csvRow(line) {
  return [...line.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
}

export function parseHoldings(csv) {
  const lines = csv.split(/\r?\n/);
  const date = lines
    .find((l) => l.startsWith("Fund Holdings as of,"))
    ?.match(/"(\w{3}) (\d{1,2}), (\d{4})"/);
  const headerIdx = lines.findIndex((l) => l.startsWith("Ticker,"));
  if (!date || headerIdx < 0) throw new Error("Unexpected holdings CSV shape");

  const header = lines[headerIdx].split(",");
  const col = Object.fromEntries(header.map((name, i) => [name, i]));
  for (const name of ["Ticker", "Name", "Type", "Sector", "Market Value", "Market Weight"])
    if (!(name in col)) throw new Error(`Holdings CSV is missing the ${name} column`);

  const [, month, day, year] = date;
  const monthIdx = MONTHS.indexOf(month);
  if (monthIdx < 0) throw new Error(`Unexpected holdings date month: ${month}`);
  const asOf = `${year}-${String(monthIdx + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;

  const holdings = lines
    .slice(headerIdx + 1)
    .map(csvRow)
    .filter(
      (r) =>
        r.length === header.length &&
        r[col.Type] === "EQUITY" &&
        Number.isFinite(Number(r[col["Market Weight"]])),
    )
    .map((r) => {
      const sector = SECTOR_ALIASES[r[col.Sector]] ?? r[col.Sector];
      if (!SECTORS.has(sector)) throw new Error(`Unknown sector: ${r[col.Sector]}`);
      return {
        ticker: r[col.Ticker].replace(" ", "."),
        name: r[col.Name],
        sector,
        marketValue: Number(r[col["Market Value"]].replaceAll(",", "")),
        fundWeight: Number(r[col["Market Weight"]]),
      };
    });

  if (holdings.length === 0) throw new Error("No equity holdings found");
  return { asOf, holdings };
}

export function wikiRows(wikitext) {
  return wikitext.split(/\n\|-\s*\n/);
}

export function wikiRowTicker(row) {
  return row.match(/^\|\|?\s*\{\{[^|}]+\|([^|}]+)\}\}/)?.[1].trim();
}

export function parseConstituents(wikitext) {
  const constituents = new Map();
  for (const row of wikiRows(wikitext)) {
    const ticker = wikiRowTicker(row);
    const cells = row
      .split("\n")
      .filter((l) => /^\|(?![-}])/.test(l))
      .flatMap((l) => l.replace(/^\|\|?/, "").split("||"))
      .map((cell) => cell.trim());
    if (!ticker || cells.length < 4) continue;
    constituents.set(ticker, {
      name: cells[1].replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1"),
      industry: cells[3],
    });
  }
  if (constituents.size === 0) throw new Error("No constituents found in wikitext");
  return constituents;
}

export function validate({ asOf, holdings }, constituents, now = new Date()) {
  if (holdings.length < MIN_HOLDINGS || holdings.length > MAX_HOLDINGS)
    throw new Error(`Expected ${MIN_HOLDINGS}-${MAX_HOLDINGS} holdings, got ${holdings.length}`);

  const stockWeight = holdings.reduce((sum, { fundWeight }) => sum + fundWeight, 0);
  if (stockWeight < MIN_STOCK_WEIGHT)
    throw new Error(
      `Stocks make up ${stockWeight.toFixed(2)}% of the fund, the holdings file may be incomplete`,
    );

  if ((now - Date.parse(asOf)) / 86_400_000 > MAX_AGE_DAYS)
    throw new Error(`Holdings are from ${asOf}, more than ${MAX_AGE_DAYS} days old`);

  const unmatched = holdings
    .map(({ ticker }) => ticker)
    .filter((ticker) => !constituents.has(ticker));
  if (unmatched.length > holdings.length * MAX_UNMATCHED_SHARE)
    throw new Error(
      `${unmatched.length} of ${holdings.length} holdings have no Wikipedia row, the wikitext format may have changed`,
    );
  return unmatched;
}

export function buildOutputs({ asOf, holdings }, constituents) {
  const total = holdings.reduce((sum, { marketValue }) => sum + marketValue, 0);
  const ranked = holdings
    .map((h) => ({ ...h, weight: (h.marketValue / total) * 100 }))
    .sort((a, b) => b.weight - a.weight)
    .map(({ ticker, name, sector, weight }, i) => ({
      rank: i + 1,
      name: constituents.get(ticker)?.name ?? name,
      ticker,
      weight,
      sector,
      industry: constituents.get(ticker)?.industry ?? "",
    }));

  for (const { ticker, name, industry } of ranked)
    if (/[<>]/.test(name + industry))
      throw new Error(`Unexpected markup in ${ticker}: ${JSON.stringify({ name, industry })}`);

  const totals = new Map();
  for (const { sector, weight } of ranked)
    totals.set(sector, (totals.get(sector) ?? 0) + weight);

  const sectors = [...totals]
    .sort(([, a], [, b]) => b - a)
    .map(([sector, sum]) => ({
      sector,
      total_percent: sum.toFixed(2),
      companies: ranked
        .filter((c) => c.sector === sector)
        .map((c) => ({ ...c, weight: c.weight.toFixed(2) })),
    }));

  return [
    {
      file: "source-us500.json",
      data: { asOf, sectors },
    },
    {
      file: "sectors.json",
      data: {
        asOf,
        labels: sectors.map(({ sector }) => sector),
        values: sectors.map(({ total_percent }) => total_percent),
      },
    },
  ];
}

async function main() {
  const [holdingsRes, constituentsRes] = await Promise.all([
    get(HOLDINGS_URL),
    get(CONSTITUENTS_URL),
  ]);
  const fund = parseHoldings(await holdingsRes.text());
  const constituents = parseConstituents((await constituentsRes.json()).parse.wikitext);

  const unmatched = validate(fund, constituents);
  if (unmatched.length)
    console.warn(`No Wikipedia industry for: ${unmatched.join(", ")}`);

  const outputs = buildOutputs(fund, constituents);

  await mkdir(OUT_DIR, { recursive: true });
  await Promise.all(
    outputs.map(({ file, data }) =>
      writeFile(join(OUT_DIR, file), JSON.stringify(data, null, 2)),
    ),
  );

  console.log(`Wrote data/source-us500.json and data/sectors.json (asOf ${fund.asOf})`);
}

if (argv[1] === fileURLToPath(import.meta.url)) await main();
