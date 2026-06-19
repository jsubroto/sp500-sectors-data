import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { buildOutputs, extractNextData } from "./fetch-us500.mjs";

const nextData = JSON.parse(
  await readFile(join(import.meta.dirname, "__fixtures__/next-data.json")),
);

test("buildOutputs maps the payload to the expected schema", () => {
  const [source, sectors] = buildOutputs(nextData, "ASOF");

  assert.equal(source.file, "source-us500.json");
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

for (const [name, nextData, expected] of [
  ["a missing payload", {}, /Unexpected sectors shape/],
  ["the old array shape", { props: { pageProps: { sectors: [] } } }, /Unexpected sectors shape/],
  [
    "a renamed field",
    { props: { pageProps: { sectors: { info: { labelsData: [] }, rows: [] } } } },
    /Unexpected sectors shape: \["info","rows"\]/,
  ],
])
  test(`buildOutputs throws on ${name}`, () =>
    assert.throws(() => buildOutputs(nextData, "ASOF"), expected));

test("extractNextData parses the embedded JSON", () => {
  const html =
    '<html><script id="__NEXT_DATA__" type="application/json">{"a":1}</script></html>';
  assert.deepEqual(extractNextData(html), { a: 1 });
});
