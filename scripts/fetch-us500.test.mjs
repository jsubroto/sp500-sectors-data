import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { buildOutputs, parseConstituents, parseHoldings, validate } from "./fetch-us500.mjs";

const fixture = (name) =>
  readFile(join(import.meta.dirname, "__fixtures__", name), "utf8");
const csv = await fixture("holdings.csv");
const wikitext = await fixture("constituents.wikitext");

test("buildOutputs maps the payload to the expected schema", () => {
  const [source, sectors] = buildOutputs(parseHoldings(csv), parseConstituents(wikitext));

  assert.equal(source.file, "source-us500.json");
  assert.equal(source.data.asOf, "2026-10-29");
  assert.ok(source.data.sectors.length > 0);

  for (const { total_percent, companies } of source.data.sectors) {
    assert.match(total_percent, /^\d+\.\d{2}$/);
    assert.ok(companies.length > 0);
    for (const c of companies)
      assert.deepEqual(Object.keys(c), [
        "rank",
        "name",
        "ticker",
        "weight",
        "sector",
        "industry",
      ]);
  }

  assert.equal(sectors.file, "sectors.json");
  assert.deepEqual(
    sectors.data.labels,
    source.data.sectors.map((s) => s.sector),
  );
  assert.deepEqual(
    sectors.data.values,
    source.data.sectors.map((s) => s.total_percent),
  );
});

test("buildOutputs scales stock weights to 100%", () => {
  const [, sectors] = buildOutputs(parseHoldings(csv), parseConstituents(wikitext));
  const sum = sectors.data.values.reduce((a, v) => a + Number(v), 0);
  assert.ok(Math.abs(sum - 100) < 0.05, `sector weights sum to ${sum}`);
});

test("buildOutputs falls back to the iShares name when Wikipedia has no row", () => {
  const [source] = buildOutputs(parseHoldings(csv), new Map());
  const [first] = source.data.sectors[0].companies;
  assert.deepEqual(
    { name: first.name, industry: first.industry },
    { name: "NVIDIA", industry: "" },
  );
});

test("buildOutputs throws on markup in a name", () =>
  assert.throws(
    () => buildOutputs(parseHoldings(csv), parseConstituents(wikitext.replace("[[Nvidia]]", "[[Nvidia]]<img src=x>"))),
    /Unexpected markup in NVDA/,
  ));

const NOW = new Date("2026-11-01T21:30:00Z");
const fund = ({ count = 500, fundWeight = 99.9 / count, asOf = "2026-10-29" } = {}) => ({
  asOf,
  holdings: Array.from({ length: count }, (_, i) => ({ ticker: `T${i}`, fundWeight })),
});
const listed = (f, missing = 0) =>
  new Map(f.holdings.slice(missing).map(({ ticker }) => [ticker, {}]));

test("validate passes a complete, current fund and returns unmatched tickers", () => {
  const f = fund();
  assert.deepEqual(validate(f, listed(f), NOW), []);
  assert.deepEqual(validate(f, listed(f, 2), NOW), ["T0", "T1"]);
});

for (const [name, f, missing, expected] of [
  ["too few holdings", fund({ count: 100 }), 0, /Expected 490-520 holdings, got 100/],
  ["too many holdings", fund({ count: 600 }), 0, /Expected 490-520 holdings, got 600/],
  ["an incomplete holdings file", fund({ fundWeight: 0.15 }), 0, /Stocks make up 75.00% of the fund/],
  ["holdings older than 7 days", fund({ asOf: "2026-10-20" }), 0, /more than 7 days old/],
  ["most tickers missing from Wikipedia", fund(), 100, /100 of 500 holdings have no Wikipedia row/],
])
  test(`validate throws on ${name}`, () =>
    assert.throws(() => validate(f, listed(f, missing), NOW), expected));

test("parseHoldings keeps only stocks that have a weight", () => {
  const { asOf, holdings } = parseHoldings(csv);
  assert.equal(asOf, "2026-10-29");
  assert.deepEqual(
    holdings.map(({ ticker, sector }) => [ticker, sector]),
    [
      ["NVDA", "Information Technology"],
      ["AAPL", "Information Technology"],
      ["GOOGL", "Communication Services"],
      ["BRK.B", "Financials"],
      ["JPM", "Financials"],
    ],
  );
});

for (const [ticker, name, industry] of [
  ["NVDA", "Nvidia", "Semiconductors"],
  ["GOOGL", "Alphabet Inc. (Class A)", "Interactive Media & Services"],
  ["BRK.B", "Berkshire Hathaway", "Multi-Sector Holdings"],
  ["CBOE", "Cboe Global Markets", "Financial Exchanges & Data"],
  ["RDDT", "Reddit", "Interactive Media & Services"],
  ["EME", "Emcor", "Construction & Engineering"],
])
  test(`parseConstituents reads the ${ticker} row`, () =>
    assert.deepEqual(parseConstituents(wikitext).get(ticker), { name, industry }));

const header = csv.split("\n").find((l) => l.startsWith("Ticker,"));
for (const [name, parse, input, expected] of [
  ["a CSV with no header", parseHoldings, "Fund Holdings as of,\"Oct 29, 2026\"", /Unexpected holdings CSV shape/],
  ["a CSV with no date", parseHoldings, header, /Unexpected holdings CSV shape/],
  [
    "an unrecognized month",
    parseHoldings,
    csv.replace('"Oct 29, 2026"', '"Okt 29, 2026"'),
    /Unexpected holdings date month: Okt/,
  ],
  [
    "a renamed column",
    parseHoldings,
    `Fund Holdings as of,"Oct 29, 2026"\n${header.replace("Market Value", "Value")}`,
    /missing the Market Value column/,
  ],
  [
    "an unknown sector",
    parseHoldings,
    csv.replace('"Financials","Equity"', '"Financial Services","Equity"'),
    /Unknown sector: Financial Services/,
  ],
  ["wikitext with no rows", parseConstituents, "{| class=\"wikitable\"\n|}", /No constituents found/],
])
  test(`${parse.name} throws on ${name}`, () => assert.throws(() => parse(input), expected));
