export type EinvoiceFormat =
  | "peppol-bis-3"
  | "xrechnung-ubl"
  | "xrechnung-cii"
  | "uncefact-cii"
  | "ubl-2.1"
  | "fatturapa"
  | "vn-gdt-xml";

export interface EinvoiceParty {
  name: string | null;
  taxId: string | null;
  companyId: string | null;
  endpointId: string | null;
  street: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  email: string | null;
}

export interface EinvoiceLineItem {
  id: string;
  name: string;
  description: string | null;
  sellerItemId: string | null;
  quantity: number;
  unitCode: string;
  unitPrice: number;
  lineTotal: number;
  taxRate: number | null;
  taxCategory: string | null;
}

export interface EinvoiceTaxSubtotal {
  taxableAmount: number;
  taxAmount: number;
  taxRate: number | null;
  taxCategory: string | null;
}

export interface EinvoiceTotals {
  lineExtensionAmount: number;
  allowanceTotalAmount: number;
  chargeTotalAmount: number;
  taxExclusiveAmount: number;
  taxTotalAmount: number;
  taxInclusiveAmount: number;
  prepaidAmount: number;
  payableAmount: number;
}

export interface EinvoicePaymentMeans {
  code: string | null;
  paymentId: string | null;
  iban: string | null;
  bic: string | null;
  accountName: string | null;
}

export interface EinvoiceValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ParsedEinvoice {
  format: EinvoiceFormat;
  documentType: "invoice" | "credit-note";
  typeCode: string;
  customizationId: string | null;
  profileId: string | null;
  invoiceNumber: string | null;
  issueDate: string | null;
  dueDate: string | null;
  buyerReference: string | null;
  currency: string;
  seller: EinvoiceParty;
  buyer: EinvoiceParty;
  lineItems: EinvoiceLineItem[];
  taxBreakdown: EinvoiceTaxSubtotal[];
  totals: EinvoiceTotals;
  paymentMeans: EinvoicePaymentMeans | null;
  validation: EinvoiceValidationResult;
}

export interface ValidateOptions {
  tolerance?: number;
}

export function parseEinvoice(xmlString: string, options?: ValidateOptions): ParsedEinvoice;
export function validateEinvoiceTotals(invoice: ParsedEinvoice, options?: ValidateOptions): EinvoiceValidationResult;
export function einvoicesToCsv(invoices: ParsedEinvoice[]): string;
