import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { extractNextData } from "./fetch-us500.mjs";

const URL = "https://us500.com/sp500-companies-by-sector";
const SECTORS = 2;
const COMPANIES_PER_SECTOR = 2;

const DIR = join(import.meta.dirname, "__fixtures__");
const OUT = join(DIR, "next-data.json");

const res = await fetch(URL);
if (!res.ok) throw new Error(`HTTP ${res.status}`);

const { info, companies } = extractNextData(await res.text()).props.pageProps
  .sectors;
const labels = info.labelsData.slice(0, SECTORS);

const reduced = {
  props: {
    pageProps: {
      sectors: {
        info: {
          labelsData: labels,
          holdData: info.holdData.slice(0, SECTORS),
          colorArray: info.colorArray.slice(0, SECTORS),
        },
        companies: labels.flatMap((sector) =>
          companies
            .filter((c) => c.sector === sector)
            .slice(0, COMPANIES_PER_SECTOR),
        ),
      },
    },
  },
};

await mkdir(DIR, { recursive: true });
await writeFile(OUT, JSON.stringify(reduced, null, 2));

console.log(`Wrote ${OUT}`);
