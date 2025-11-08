import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const URL = "https://us500.com/sp500-companies-by-sector";
const OUT_DIR = "data";

function extractNextData(html) {
  const marker = '<script id="__NEXT_DATA__" type="application/json">';
  const i = html.indexOf(marker);
  if (i < 0) throw new Error("__NEXT_DATA__ tag not found");

  const start = i + marker.length;
  const end = html.indexOf("</script>", start);
  if (end < 0) throw new Error("Closing </script> not found");

  return JSON.parse(html.slice(start, end));
}

const res = await fetch(URL);
if (!res.ok) throw new Error(`HTTP ${res.status}`);

const html = await res.text();
const nextData = extractNextData(html);
const sectors = nextData?.props?.pageProps?.sectors;
if (!Array.isArray(sectors) || !sectors.length)
  throw new Error("No sectors found");

await mkdir(OUT_DIR, { recursive: true });
const asOf = new Date().toISOString().slice(0, 10);

const outputs = [
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

await Promise.all(
  outputs.map(({ file, data }) =>
    writeFile(join(OUT_DIR, file), JSON.stringify(data, null, 2)),
  ),
);

console.log("Wrote data/source-us500.json and data/sectors.json");
