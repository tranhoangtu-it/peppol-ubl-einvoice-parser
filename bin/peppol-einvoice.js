#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { einvoicesToCsv, parseEinvoice } from "../src/index.js";

function printHelp() {
  console.log(`peppol-einvoice — Zero-dependency XML e-invoice parser (UBL 2.1, Peppol BIS 3.0, XRechnung, FatturaPA, Vietnam GDT)

Usage:
  peppol-einvoice [options] <file1.xml> [file2.xml ...]

Options:
  --csv         Export parsed invoices as an ERP ledger CSV table
  --validate    Exit with status 1 if any invoice fails arithmetic / mandatory field checks
  --pretty      Pretty-print JSON output (default when parsing a single file)
  -h, --help    Show this help message
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  const asCsv = args.includes("--csv");
  const strictValidate = args.includes("--validate");
  const files = args.filter((arg) => !arg.startsWith("-"));

  if (files.length === 0) {
    console.error("Error: Provide at least one XML invoice path.");
    process.exit(1);
  }

  const results = [];
  for (const filePath of files) {
    const xml = await readFile(filePath, "utf8");
    results.push(parseEinvoice(xml));
  }

  if (asCsv) {
    console.log(einvoicesToCsv(results));
  } else if (results.length === 1) {
    console.log(JSON.stringify(results[0], null, 2));
  } else {
    console.log(JSON.stringify(results, null, 2));
  }

  if (strictValidate && results.some((inv) => !inv.validation.valid)) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
