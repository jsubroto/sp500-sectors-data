import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { argv } from "node:process";
import { fileURLToPath } from "node:url";

const URL = "https://us500.com/sp500-companies-by-sector";
const OUT_DIR = "data";

export function extractNextData(html) {
  const marker = '<script id="__NEXT_DATA__" type="application/json">';
  const i = html.indexOf(marker);
  if (i < 0) throw new Error("__NEXT_DATA__ tag not found");

  const start = i + marker.length;
  const end = html.indexOf("</script>", start);
  if (end < 0) throw new Error("Closing </script> not found");

  return JSON.parse(html.slice(start, end));
}

export function buildOutputs(nextData, asOf) {
  const raw = nextData?.props?.pageProps?.sectors ?? {};
  const { info, companies } = raw;
  if (!Array.isArray(info?.labelsData) || !Array.isArray(companies))
    throw new Error(
      `Unexpected sectors shape: ${JSON.stringify(Object.keys(raw))}`,
    );

  const sectors = info.labelsData.map((sector, i) => ({
    sector,
    total_percent: info.holdData[i].toFixed(2),
    companies: companies
      .filter((c) => c.sector === sector)
      .map(({ price, ...rest }) => rest),
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
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();
  const asOf = new Date().toISOString().slice(0, 10);
  const outputs = buildOutputs(extractNextData(html), asOf);

  await mkdir(OUT_DIR, { recursive: true });
  await Promise.all(
    outputs.map(({ file, data }) =>
      writeFile(join(OUT_DIR, file), JSON.stringify(data, null, 2)),
    ),
  );

  console.log("Wrote data/source-us500.json and data/sectors.json");
}

if (argv[1] === fileURLToPath(import.meta.url)) await main();
