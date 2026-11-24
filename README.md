# peppol-ubl-einvoice-parser

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](./package.json)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-LedgerFlow%20Workbench-6366f1)](https://ketoan-pro.tranhoangtu-it.workers.dev)

**Zero-dependency ES-module & CLI parser** for structured XML e-invoices across European EN 16931 and APAC tax standards:

- **Peppol BIS Billing 3.0** (`Invoice` & `CreditNote`)
- **OASIS UBL 2.1** (`Invoice` & `CreditNote`)
- **XRechnung 3.0** (both OASIS UBL and UN/CEFACT `CrossIndustryInvoice` CII syntaxes)
- **Italian FatturaPA v1.2** (`FatturaElettronica`)
- **Vietnam GDT E-Invoice XML** (`HDon` / `DLHDon` Circular 78 / Decision 1450)

Runs identically in **Node.js 18+**, **Bun**, **Deno**, **Cloudflare Workers**, and modern browsers with **zero `node_modules` bloat**.

---

## Live Demo & Commercial Pro Edition

- **Try in Browser (Instant XML Inspector & Batch Ledger Export):** [https://ketoan-pro.tranhoangtu-it.workers.dev](https://ketoan-pro.tranhoangtu-it.workers.dev)
- **Developer Utilities & JSON/XML Toolbox:** [https://toolbox-pro.tranhoangtu-it.workers.dev](https://toolbox-pro.tranhoangtu-it.workers.dev)

> ### Upgrade to **LedgerFlow Enterprise OS — Pro Source Bundle**
> Building an accounting SaaS, ERP connector, or multi-client tax reconciliation portal? Grab the full production **LedgerFlow Enterprise OS** source kit (batch ZIP ingestion, multi-jurisdiction VAT/GST audit rules, anomaly detection, double-entry journal mapper, PDF/HTML print templates, and Cloudflare Worker + local-first UI):
>
> - **Get on Gumroad:** [https://tranhoangtu.gumroad.com/l/kihth](https://tranhoangtu.gumroad.com/l/kihth)
> - **Get on Payhip:** [https://payhip.com/b/CAbY6](https://payhip.com/b/CAbY6)

---

## Quick Start

### Programmatic Usage (ESM / TypeScript)

```js
import { parseEinvoice, einvoicesToCsv } from "peppol-ubl-einvoice-parser";
import { readFile } from "node:fs/promises";

const xml = await readFile("./invoice-peppol.xml", "utf8");
const invoice = parseEinvoice(xml);

console.log(invoice.format);          // "peppol-bis-3"
console.log(invoice.invoiceNumber);   // "INV-2026-0042"
console.log(invoice.seller.taxId);    // "DE123456789"
console.log(invoice.totals);          // { lineExtensionAmount, taxExclusiveAmount, taxTotalAmount, payableAmount, ... }
console.log(invoice.validation);      // { valid: true, errors: [] }

// Convert multiple XML formats into one unified ERP CSV ledger
const csv = einvoicesToCsv([invoice]);
```

### CLI Usage

```bash
# Parse a single XML e-invoice to normalized JSON and verify arithmetic totals
npx peppol-einvoice --validate ./invoices/xrechnung-cii.xml

# Batch-convert mixed Peppol, FatturaPA, and Vietnam XML invoices into a single CSV ledger
npx peppol-einvoice --csv ./invoices/*.xml > ledger-2026-11.csv
```

---

## Normalized Output Schema

Every supported XML dialect is normalized into a single predictable schema:

| Field | Type | Description |
| :--- | :--- | :--- |
| `format` | `string` | `"peppol-bis-3"` \| `"xrechnung-ubl"` \| `"xrechnung-cii"` \| `"uncefact-cii"` \| `"ubl-2.1"` \| `"fatturapa"` \| `"vn-gdt-xml"` |
| `documentType` | `string` | `"invoice"` \| `"credit-note"` |
| `invoiceNumber` | `string \| null` | Document ID (`cbc:ID`, `ram:ID`, `Numero`, `SHDon`) |
| `issueDate` / `dueDate` | `string \| null` | ISO `YYYY-MM-DD` date (automatically normalizes CII `102` `YYYYMMDD` dates) |
| `currency` | `string` | ISO 4217 currency code (`EUR`, `USD`, `VND`, etc.) |
| `seller` / `buyer` | `EinvoiceParty` | `{ name, taxId, companyId, endpointId, street, city, postalCode, country, email }` |
| `lineItems` | `EinvoiceLineItem[]` | `{ id, name, description, sellerItemId, quantity, unitCode, unitPrice, lineTotal, taxRate, taxCategory }` |
| `taxBreakdown` | `EinvoiceTaxSubtotal[]` | `{ taxableAmount, taxAmount, taxRate, taxCategory }` |
| `totals` | `EinvoiceTotals` | `{ lineExtensionAmount, allowanceTotalAmount, chargeTotalAmount, taxExclusiveAmount, taxTotalAmount, taxInclusiveAmount, prepaidAmount, payableAmount }` |
| `paymentMeans` | `EinvoicePaymentMeans \| null` | `{ code, paymentId, iban, bic, accountName }` |
| `validation` | `{ valid, errors }` | Built-in arithmetic cross-check of net lines, allowances/charges, VAT totals, and payable amounts |

---

## Open-Core Comparison

| Capability | Open-Source (`peppol-ubl-einvoice-parser`) | [LedgerFlow Enterprise OS Pro](https://tranhoangtu.gumroad.com/l/kihth) |
| :--- | :---: | :---: |
| UBL 2.1 / Peppol BIS 3.0 / XRechnung / FatturaPA / VN XML parser | Included | Included |
| CLI JSON & CSV batch converter | Included | Included |
| Browser drag-and-drop multi-ZIP workspace & visual audit UI | [Live Demo](https://ketoan-pro.tranhoangtu-it.workers.dev) | Full White-Label Source |
| Duplicate invoice, tax-ID checksum & VAT rounding anomaly engine | Basic totals | Full Rule Engine |
| Double-entry chart-of-accounts mapper (MISA / QuickBooks / Xero CSV) | — | Included |
| Printable bilingual PDF/HTML voucher & reconciliation report | — | Included |

- **Download Pro Source on Gumroad:** [https://tranhoangtu.gumroad.com/l/kihth](https://tranhoangtu.gumroad.com/l/kihth)
- **Download Pro Source on Payhip:** [https://payhip.com/b/CAbY6](https://payhip.com/b/CAbY6)

---

## Running Tests

```bash
node --test
```

## License

MIT © Tran Hoang Tu
