import { attrAt, findAll, findNode, numberAt, parseXmlTree, textAt } from "./xml.js";

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function detectUblProfile(customizationId = "", profileId = "") {
  const combined = `${customizationId} ${profileId}`.toLowerCase();
  if (combined.includes("xrechnung")) return "xrechnung-ubl";
  if (combined.includes("peppol") || combined.includes("urn:cen.eu:en16931")) return "peppol-bis-3";
  return "ubl-2.1";
}

function parseUblParty(partyWrapper) {
  const party = findNode(partyWrapper, ["Party"]) ?? partyWrapper;
  if (!party) {
    return { name: null, taxId: null, companyId: null, endpointId: null, country: null, city: null, street: null, postalCode: null, email: null };
  }
  const name =
    textAt(party, ["PartyLegalEntity", "RegistrationName"]) ??
    textAt(party, ["PartyName", "Name"]) ??
    null;
  const taxId =
    textAt(party, ["PartyTaxScheme", "CompanyID"]) ??
    textAt(party, ["PartyLegalEntity", "CompanyID"]) ??
    null;
  const companyId = textAt(party, ["PartyLegalEntity", "CompanyID"]) ?? null;
  const endpointId = textAt(party, ["EndpointID"]) ?? null;
  const address = findNode(party, ["PostalAddress"]);
  return {
    name,
    taxId,
    companyId,
    endpointId,
    street: textAt(address, ["StreetName"]),
    city: textAt(address, ["CityName"]),
    postalCode: textAt(address, ["PostalZone"]),
    country: textAt(address, ["Country", "IdentificationCode"]),
    email: textAt(party, ["Contact", "ElectronicMail"]),
  };
}

function parseUblDocument(root) {
  const isCreditNote = root.name === "CreditNote";
  const customizationId = textAt(root, ["CustomizationID"], "");
  const profileId = textAt(root, ["ProfileID"], "");
  const format = detectUblProfile(customizationId, profileId);

  const currency =
    textAt(root, ["DocumentCurrencyCode"]) ??
    attrAt(root, ["LegalMonetaryTotal", "PayableAmount"], "currencyID") ??
    "EUR";

  const lineTag = isCreditNote ? "CreditNoteLine" : "InvoiceLine";
  const qtyTag = isCreditNote ? "CreditedQuantity" : "InvoicedQuantity";

  const lineItems = findAll(root, lineTag).map((line, idx) => {
    const quantity = numberAt(line, [qtyTag], 1);
    const unitCode = attrAt(line, [qtyTag], "unitCode", "EA");
    const lineTotal = numberAt(line, ["LineExtensionAmount"], 0);
    const unitPrice =
      numberAt(line, ["Price", "PriceAmount"]) ??
      (quantity ? roundMoney(lineTotal / quantity) : lineTotal);
    const taxRate =
      numberAt(line, ["Item", "ClassifiedTaxCategory", "Percent"]) ??
      numberAt(line, ["TaxTotal", "TaxSubtotal", "TaxCategory", "Percent"]) ??
      null;
    const taxCategory =
      textAt(line, ["Item", "ClassifiedTaxCategory", "ID"]) ??
      textAt(line, ["TaxTotal", "TaxSubtotal", "TaxCategory", "ID"]) ??
      null;

    return {
      id: textAt(line, ["ID"], String(idx + 1)),
      name: textAt(line, ["Item", "Name"]) ?? textAt(line, ["Item", "Description"]) ?? "",
      description: textAt(line, ["Item", "Description"]),
      sellerItemId: textAt(line, ["Item", "SellersItemIdentification", "ID"]),
      quantity,
      unitCode,
      unitPrice,
      lineTotal,
      taxRate,
      taxCategory,
    };
  });

  const taxBreakdown = findAll(root, ["TaxTotal", "TaxSubtotal"]).map((sub) => ({
    taxableAmount: numberAt(sub, ["TaxableAmount"], 0),
    taxAmount: numberAt(sub, ["TaxAmount"], 0),
    taxRate: numberAt(sub, ["TaxCategory", "Percent"]),
    taxCategory: textAt(sub, ["TaxCategory", "ID"]),
  }));

  const monetary = findNode(root, ["LegalMonetaryTotal"]);
  const taxExclusiveAmount =
    numberAt(monetary, ["TaxExclusiveAmount"]) ??
    roundMoney(lineItems.reduce((acc, item) => acc + (item.lineTotal ?? 0), 0));
  const taxTotalAmount =
    numberAt(root, ["TaxTotal", "TaxAmount"]) ??
    roundMoney(taxBreakdown.reduce((acc, item) => acc + (item.taxAmount ?? 0), 0));
  const taxInclusiveAmount =
    numberAt(monetary, ["TaxInclusiveAmount"]) ??
    roundMoney(taxExclusiveAmount + taxTotalAmount);
  const prepaidAmount = numberAt(monetary, ["PrepaidAmount"], 0);
  const payableAmount =
    numberAt(monetary, ["PayableAmount"]) ??
    roundMoney(taxInclusiveAmount - prepaidAmount);

  const paymentMeansNode = findNode(root, ["PaymentMeans"]);
  const paymentMeans = paymentMeansNode
    ? {
        code: textAt(paymentMeansNode, ["PaymentMeansCode"]),
        paymentId: textAt(paymentMeansNode, ["PaymentID"]),
        iban: textAt(paymentMeansNode, ["PayeeFinancialAccount", "ID"]),
        bic: textAt(paymentMeansNode, ["PayeeFinancialAccount", "FinancialInstitutionBranch", "ID"]),
        accountName: textAt(paymentMeansNode, ["PayeeFinancialAccount", "Name"]),
      }
    : null;

  return {
    format,
    documentType: isCreditNote ? "credit-note" : "invoice",
    typeCode: textAt(root, [isCreditNote ? "CreditNoteTypeCode" : "InvoiceTypeCode"], isCreditNote ? "381" : "380"),
    customizationId: customizationId || null,
    profileId: profileId || null,
    invoiceNumber: textAt(root, ["ID"]),
    issueDate: textAt(root, ["IssueDate"]),
    dueDate: textAt(root, ["DueDate"]) ?? textAt(root, ["PaymentMeans", "PaymentDueDate"]),
    buyerReference: textAt(root, ["BuyerReference"]) ?? textAt(root, ["OrderReference", "ID"]),
    currency,
    seller: parseUblParty(findNode(root, ["AccountingSupplierParty"])),
    buyer: parseUblParty(findNode(root, ["AccountingCustomerParty"])),
    lineItems,
    taxBreakdown,
    totals: {
      lineExtensionAmount: numberAt(monetary, ["LineExtensionAmount"], taxExclusiveAmount),
      allowanceTotalAmount: numberAt(monetary, ["AllowanceTotalAmount"], 0),
      chargeTotalAmount: numberAt(monetary, ["ChargeTotalAmount"], 0),
      taxExclusiveAmount,
      taxTotalAmount,
      taxInclusiveAmount,
      prepaidAmount,
      payableAmount,
    },
    paymentMeans,
  };
}

function parseCiiDate(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\d{8}$/.test(trimmed)) {
    return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
  }
  return trimmed;
}

function parseCiiParty(partyNode) {
  if (!partyNode) {
    return { name: null, taxId: null, companyId: null, endpointId: null, country: null, city: null, street: null, postalCode: null, email: null };
  }
  const address = findNode(partyNode, ["PostalTradeAddress"]);
  return {
    name: textAt(partyNode, ["Name"]),
    taxId: textAt(partyNode, ["SpecifiedTaxRegistration", "ID"]),
    companyId: textAt(partyNode, ["SpecifiedLegalOrganization", "ID"]),
    endpointId: textAt(partyNode, ["URIUniversalCommunication", "URIID"]),
    street: textAt(address, ["LineOne"]),
    city: textAt(address, ["CityName"]),
    postalCode: textAt(address, ["PostcodeCode"]),
    country: textAt(address, ["CountryID"]),
    email: textAt(partyNode, ["DefinedTradeContact", "EmailURIUniversalCommunication", "URIID"]),
  };
}

function parseCiiDocument(root) {
  const guidelineId = textAt(root, ["ExchangedDocumentContext", "GuidelineSpecifiedDocumentContextParameter", "ID"], "");
  const typeCode = textAt(root, ["ExchangedDocument", "TypeCode"], "380");
  const isCreditNote = typeCode === "381";
  const transaction = findNode(root, ["SupplyChainTradeTransaction"]);
  const agreement = findNode(transaction, ["ApplicableHeaderTradeAgreement"]);
  const settlement = findNode(transaction, ["ApplicableHeaderTradeSettlement"]);
  const summation = findNode(settlement, ["SpecifiedTradeSettlementHeaderMonetarySummation"]);

  const currency = textAt(settlement, ["InvoiceCurrencyCode"], "EUR");
  const lineItems = findAll(transaction, "IncludedSupplyChainTradeLineItem").map((line, idx) => {
    const quantity = numberAt(line, ["SpecifiedLineTradeDelivery", "BilledQuantity"], 1);
    const unitCode = attrAt(line, ["SpecifiedLineTradeDelivery", "BilledQuantity"], "unitCode", "EA");
    const unitPrice = numberAt(line, ["SpecifiedLineTradeAgreement", "NetPriceProductTradePrice", "ChargeAmount"], 0);
    const lineTotal =
      numberAt(line, ["SpecifiedLineTradeSettlement", "SpecifiedTradeSettlementLineMonetarySummation", "LineTotalAmount"]) ??
      roundMoney(quantity * unitPrice);
    const taxNode = findNode(line, ["SpecifiedLineTradeSettlement", "ApplicableTradeTax"]);
    return {
      id: textAt(line, ["AssociatedDocumentLineDocument", "LineID"], String(idx + 1)),
      name: textAt(line, ["SpecifiedTradeProduct", "Name"], ""),
      description: textAt(line, ["SpecifiedTradeProduct", "Description"]),
      sellerItemId: textAt(line, ["SpecifiedTradeProduct", "SellerAssignedID"]),
      quantity,
      unitCode,
      unitPrice,
      lineTotal,
      taxRate: numberAt(taxNode, ["RateApplicablePercent"]),
      taxCategory: textAt(taxNode, ["CategoryCode"]),
    };
  });

  const taxBreakdown = findAll(settlement, "ApplicableTradeTax").map((tax) => ({
    taxableAmount: numberAt(tax, ["BasisAmount"], 0),
    taxAmount: numberAt(tax, ["CalculatedAmount"], 0),
    taxRate: numberAt(tax, ["RateApplicablePercent"]),
    taxCategory: textAt(tax, ["CategoryCode"]),
  }));

  const taxExclusiveAmount = numberAt(summation, ["TaxBasisTotalAmount"], 0);
  const taxTotalAmount = numberAt(summation, ["TaxTotalAmount"], 0);
  const taxInclusiveAmount = numberAt(summation, ["GrandTotalAmount"], roundMoney(taxExclusiveAmount + taxTotalAmount));
  const prepaidAmount = numberAt(summation, ["TotalPrepaidAmount"], 0);
  const payableAmount = numberAt(summation, ["DuePayableAmount"], roundMoney(taxInclusiveAmount - prepaidAmount));
  const paymentMeansNode = findNode(settlement, ["SpecifiedTradeSettlementPaymentMeans"]);

  return {
    format: guidelineId.toLowerCase().includes("xrechnung") ? "xrechnung-cii" : "uncefact-cii",
    documentType: isCreditNote ? "credit-note" : "invoice",
    typeCode,
    customizationId: guidelineId || null,
    profileId: null,
    invoiceNumber: textAt(root, ["ExchangedDocument", "ID"]),
    issueDate: parseCiiDate(textAt(root, ["ExchangedDocument", "IssueDateTime", "DateTimeString"])),
    dueDate: parseCiiDate(
      textAt(settlement, ["SpecifiedTradePaymentTerms", "DueDateDateTime", "DateTimeString"]),
    ),
    buyerReference: textAt(agreement, ["BuyerReference"]),
    currency,
    seller: parseCiiParty(findNode(agreement, ["SellerTradeParty"])),
    buyer: parseCiiParty(findNode(agreement, ["BuyerTradeParty"])),
    lineItems,
    taxBreakdown,
    totals: {
      lineExtensionAmount: numberAt(summation, ["LineTotalAmount"], taxExclusiveAmount),
      allowanceTotalAmount: numberAt(summation, ["AllowanceTotalAmount"], 0),
      chargeTotalAmount: numberAt(summation, ["ChargeTotalAmount"], 0),
      taxExclusiveAmount,
      taxTotalAmount,
      taxInclusiveAmount,
      prepaidAmount,
      payableAmount,
    },
    paymentMeans: paymentMeansNode
      ? {
          code: textAt(paymentMeansNode, ["TypeCode"]),
          paymentId: textAt(settlement, ["PaymentReference"]),
          iban: textAt(paymentMeansNode, ["PayeePartyCreditorFinancialAccount", "IBANID"]),
          bic: textAt(paymentMeansNode, ["PayeeSpecifiedCreditorFinancialInstitution", "BICID"]),
          accountName: textAt(paymentMeansNode, ["PayeePartyCreditorFinancialAccount", "AccountName"]),
        }
      : null,
  };
}

function parseFatturaPaParty(partyNode) {
  const datiAnagrafici = findNode(partyNode, ["DatiAnagrafici"]);
  const anagrafica = findNode(datiAnagrafici, ["Anagrafica"]);
  const sede = findNode(partyNode, ["Sede"]);
  const idCountry = textAt(datiAnagrafici, ["IdFiscaleIVA", "IdPaese"], "");
  const idCode = textAt(datiAnagrafici, ["IdFiscaleIVA", "IdCodice"], "");
  const fullName =
    textAt(anagrafica, ["Denominazione"]) ??
    ([textAt(anagrafica, ["Nome"], ""), textAt(anagrafica, ["Cognome"], "")].filter(Boolean).join(" ") || null);

  return {
    name: fullName,
    taxId: idCode ? `${idCountry}${idCode}` : textAt(datiAnagrafici, ["CodiceFiscale"]),
    companyId: textAt(datiAnagrafici, ["CodiceFiscale"]),
    endpointId: null,
    street: textAt(sede, ["Indirizzo"]),
    city: textAt(sede, ["Comune"]),
    postalCode: textAt(sede, ["CAP"]),
    country: textAt(sede, ["Nazione"]) ?? (idCountry || null),
    email: textAt(partyNode, ["Contatti", "Email"]),
  };
}

function parseFatturaPaDocument(root) {
  const header = findNode(root, ["FatturaElettronicaHeader"]);
  const body = findNode(root, ["FatturaElettronicaBody"]);
  const datiGenerali = findNode(body, ["DatiGenerali", "DatiGeneraliDocumento"]);
  const datiBeniServizi = findNode(body, ["DatiBeniServizi"]);
  const paymentDetail = findNode(body, ["DatiPagamento", "DettaglioPagamento"]);

  const tipoDocumento = textAt(datiGenerali, ["TipoDocumento"], "TD01");
  const isCreditNote = tipoDocumento === "TD04" || tipoDocumento === "TD08";
  const currency = textAt(datiGenerali, ["Divisa"], "EUR");

  const lineItems = findAll(datiBeniServizi, "DettaglioLinee").map((line, idx) => {
    const quantity = numberAt(line, ["Quantita"], 1);
    const unitPrice = numberAt(line, ["PrezzoUnitario"], 0);
    const lineTotal = numberAt(line, ["PrezzoTotale"], roundMoney(quantity * unitPrice));
    return {
      id: textAt(line, ["NumeroLinea"], String(idx + 1)),
      name: textAt(line, ["Descrizione"], ""),
      description: textAt(line, ["Descrizione"]),
      sellerItemId: textAt(line, ["CodiceArticolo", "CodiceValore"]),
      quantity,
      unitCode: textAt(line, ["UnitaMisura"], "EA"),
      unitPrice,
      lineTotal,
      taxRate: numberAt(line, ["AliquotaIVA"]),
      taxCategory: textAt(line, ["Natura"]) ?? "S",
    };
  });

  const taxBreakdown = findAll(datiBeniServizi, "DatiRiepilogo").map((riep) => ({
    taxableAmount: numberAt(riep, ["ImponibileImporto"], 0),
    taxAmount: numberAt(riep, ["Imposta"], 0),
    taxRate: numberAt(riep, ["AliquotaIVA"]),
    taxCategory: textAt(riep, ["Natura"]) ?? "S",
  }));

  const taxExclusiveAmount = roundMoney(
    taxBreakdown.length > 0
      ? taxBreakdown.reduce((sum, item) => sum + item.taxableAmount, 0)
      : lineItems.reduce((sum, item) => sum + item.lineTotal, 0),
  );
  const taxTotalAmount = roundMoney(taxBreakdown.reduce((sum, item) => sum + item.taxAmount, 0));
  const taxInclusiveAmount =
    numberAt(datiGenerali, ["ImportoTotaleDocumento"]) ?? roundMoney(taxExclusiveAmount + taxTotalAmount);
  const payableAmount = numberAt(paymentDetail, ["ImportoPagamento"], taxInclusiveAmount);

  return {
    format: "fatturapa",
    documentType: isCreditNote ? "credit-note" : "invoice",
    typeCode: tipoDocumento,
    customizationId: root.attrs.versione ?? textAt(header, ["DatiTrasmissione", "FormatoTrasmissione"]),
    profileId: textAt(header, ["DatiTrasmissione", "CodiceDestinatario"]),
    invoiceNumber: textAt(datiGenerali, ["Numero"]),
    issueDate: textAt(datiGenerali, ["Data"]),
    dueDate: textAt(paymentDetail, ["DataScadenzaPagamento"]),
    buyerReference: textAt(body, ["DatiGenerali", "DatiOrdineAcquisto", "IdDocumento"]),
    currency,
    seller: parseFatturaPaParty(findNode(header, ["CedentePrestatore"])),
    buyer: parseFatturaPaParty(findNode(header, ["CessionarioCommittente"])),
    lineItems,
    taxBreakdown,
    totals: {
      lineExtensionAmount: roundMoney(lineItems.reduce((sum, item) => sum + item.lineTotal, 0)),
      allowanceTotalAmount: 0,
      chargeTotalAmount: 0,
      taxExclusiveAmount,
      taxTotalAmount,
      taxInclusiveAmount,
      prepaidAmount: 0,
      payableAmount,
    },
    paymentMeans: paymentDetail
      ? {
          code: textAt(paymentDetail, ["ModalitaPagamento"]),
          paymentId: null,
          iban: textAt(paymentDetail, ["IBAN"]),
          bic: textAt(paymentDetail, ["BIC"]),
          accountName: textAt(paymentDetail, ["IstitutoFinanziario"]),
        }
      : null,
  };
}

function parseVnTaxRate(rawRate) {
  if (!rawRate) return null;
  const cleaned = rawRate.trim().toUpperCase();
  if (cleaned === "KCT" || cleaned === "KKKNT") return 0;
  const numeric = Number(cleaned.replace("%", "").replace(",", "."));
  return Number.isFinite(numeric) ? numeric : null;
}

function parseVietnamGdtDocument(root) {
  const dlhdon = root.name === "DLHDon" ? root : findNode(root, ["DLHDon"]) ?? root;
  const ttChung = findNode(dlhdon, ["TTChung"]);
  const ndHDon = findNode(dlhdon, ["NDHDon"]);
  const nBan = findNode(ndHDon, ["NBan"]);
  const nMua = findNode(ndHDon, ["NMua"]);
  const tToan = findNode(ndHDon, ["TToan"]);

  const khmsHDon = textAt(ttChung, ["KHMSHDon"], "");
  const khHDon = textAt(ttChung, ["KHHDon"], "");
  const shDon = textAt(ttChung, ["SHDon"], "");
  const currency = textAt(ttChung, ["DVTTe"], "VND");

  const lineNodes = findAll(ndHDon, ["DSHHDVu", "HHDVu"]);
  const lineItems = lineNodes.map((line, idx) => {
    const quantity = numberAt(line, ["SLuong"], 1);
    const unitPrice = numberAt(line, ["DGia"], 0);
    const lineTotal = numberAt(line, ["ThTien"], roundMoney(quantity * unitPrice));
    const rawRate = textAt(line, ["TSuat"]);
    return {
      id: textAt(line, ["STT"], String(idx + 1)),
      name: textAt(line, ["THHDVu"], ""),
      description: textAt(line, ["THHDVu"]),
      sellerItemId: textAt(line, ["MHHDVu"]),
      quantity,
      unitCode: textAt(line, ["DVTinh"], "EA"),
      unitPrice,
      lineTotal,
      taxRate: parseVnTaxRate(rawRate),
      taxCategory: rawRate ?? null,
    };
  });

  const taxBreakdown = findAll(tToan, ["THTTLTSuat", "LTSuat"]).map((lt) => {
    const rawRate = textAt(lt, ["TSuat"]);
    return {
      taxableAmount: numberAt(lt, ["ThTien"], 0),
      taxAmount: numberAt(lt, ["TThue"], 0),
      taxRate: parseVnTaxRate(rawRate),
      taxCategory: rawRate ?? null,
    };
  });

  const taxExclusiveAmount =
    numberAt(tToan, ["TgTCThue"]) ??
    roundMoney(lineItems.reduce((sum, item) => sum + item.lineTotal, 0));
  const taxTotalAmount =
    numberAt(tToan, ["TgTThue"]) ??
    roundMoney(taxBreakdown.reduce((sum, item) => sum + item.taxAmount, 0));
  const payableAmount =
    numberAt(tToan, ["TgTTTBSo"]) ?? roundMoney(taxExclusiveAmount + taxTotalAmount);

  return {
    format: "vn-gdt-xml",
    documentType: "invoice",
    typeCode: khmsHDon || "1",
    customizationId: textAt(ttChung, ["PBan"], "2.0.1"),
    profileId: [khmsHDon, khHDon].filter(Boolean).join("-") || null,
    invoiceNumber: shDon || null,
    issueDate: textAt(ttChung, ["NLap"]),
    dueDate: null,
    buyerReference: textAt(nMua, ["MKHang"]),
    currency,
    seller: {
      name: textAt(nBan, ["Ten"]),
      taxId: textAt(nBan, ["MST"]),
      companyId: textAt(nBan, ["MST"]),
      endpointId: textAt(dlhdon, ["MCCQT"]) ?? root.children.find((c) => c.name === "MCCQT")?.text ?? null,
      street: textAt(nBan, ["DChi"]),
      city: null,
      postalCode: null,
      country: "VN",
      email: textAt(nBan, ["DCTDTu"]),
    },
    buyer: {
      name: textAt(nMua, ["Ten"]) ?? textAt(nMua, ["HVTNMHang"]),
      taxId: textAt(nMua, ["MST"]),
      companyId: textAt(nMua, ["MST"]),
      endpointId: null,
      street: textAt(nMua, ["DChi"]),
      city: null,
      postalCode: null,
      country: "VN",
      email: textAt(nMua, ["DCTDTu"]),
    },
    lineItems,
    taxBreakdown,
    totals: {
      lineExtensionAmount: roundMoney(lineItems.reduce((sum, item) => sum + item.lineTotal, 0)),
      allowanceTotalAmount: numberAt(tToan, ["TTCKTMai"], 0),
      chargeTotalAmount: 0,
      taxExclusiveAmount,
      taxTotalAmount,
      taxInclusiveAmount: payableAmount,
      prepaidAmount: 0,
      payableAmount,
    },
    paymentMeans: {
      code: textAt(ttChung, ["HTTToan"]),
      paymentId: null,
      iban: textAt(nBan, ["STKNHang"]),
      bic: null,
      accountName: textAt(nBan, ["TNHang"]),
    },
  };
}

/**
 * Validates arithmetic consistency and core EN 16931 / GDT mandatory fields.
 */
export function validateEinvoiceTotals(invoice, options = {}) {
  const tolerance = options.tolerance ?? (invoice.currency === "VND" ? 1 : 0.02);
  const errors = [];

  if (!invoice.invoiceNumber) errors.push("Missing invoiceNumber");
  if (!invoice.issueDate) errors.push("Missing issueDate");
  if (!invoice.seller?.name) errors.push("Missing seller.name");
  if (!invoice.lineItems || invoice.lineItems.length === 0) {
    errors.push("Invoice must contain at least one line item");
  }

  const computedLineSum = roundMoney(
    (invoice.lineItems ?? []).reduce((sum, item) => sum + (item.lineTotal ?? 0), 0),
  );
  const expectedNet = roundMoney(
    computedLineSum - (invoice.totals.allowanceTotalAmount ?? 0) + (invoice.totals.chargeTotalAmount ?? 0),
  );
  if (Math.abs(expectedNet - invoice.totals.taxExclusiveAmount) > tolerance) {
    errors.push(
      `Tax-exclusive amount (${invoice.totals.taxExclusiveAmount}) disagrees with net line items (${expectedNet})`,
    );
  }

  const expectedGross = roundMoney(invoice.totals.taxExclusiveAmount + invoice.totals.taxTotalAmount);
  if (Math.abs(expectedGross - invoice.totals.taxInclusiveAmount) > tolerance) {
    errors.push(
      `Tax-inclusive amount (${invoice.totals.taxInclusiveAmount}) disagrees with net + tax (${expectedGross})`,
    );
  }

  const expectedPayable = roundMoney(
    invoice.totals.taxInclusiveAmount - (invoice.totals.prepaidAmount ?? 0),
  );
  if (Math.abs(expectedPayable - invoice.totals.payableAmount) > tolerance) {
    errors.push(
      `Payable amount (${invoice.totals.payableAmount}) disagrees with gross - prepaid (${expectedPayable})`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Parses an XML e-invoice string (UBL 2.1, Peppol BIS Billing 3.0, XRechnung UBL/CII,
 * FatturaPA, or Vietnam GDT Circular 78 XML) into a normalized JSON structure.
 */
export function parseEinvoice(xmlString, options = {}) {
  const root = parseXmlTree(xmlString);
  let parsed;

  if (root.name === "Invoice" || root.name === "CreditNote") {
    parsed = parseUblDocument(root);
  } else if (root.name === "CrossIndustryInvoice") {
    parsed = parseCiiDocument(root);
  } else if (root.name === "FatturaElettronica") {
    parsed = parseFatturaPaDocument(root);
  } else if (root.name === "HDon" || root.name === "DLHDon") {
    parsed = parseVietnamGdtDocument(root);
  } else {
    throw new Error(`Unsupported e-invoice XML root element: <${root.rawName}>`);
  }

  parsed.validation = validateEinvoiceTotals(parsed, options);
  return parsed;
}

function escapeCsvCell(value) {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Exports an array of parsed e-invoices into an ERP-ready ledger CSV string.
 */
export function einvoicesToCsv(invoices) {
  const headers = [
    "format",
    "document_type",
    "invoice_number",
    "issue_date",
    "due_date",
    "currency",
    "seller_name",
    "seller_tax_id",
    "buyer_name",
    "buyer_tax_id",
    "tax_exclusive_amount",
    "tax_total_amount",
    "payable_amount",
    "line_count",
    "valid",
  ];
  const rows = [headers.join(",")];
  for (const inv of invoices) {
    rows.push(
      [
        inv.format,
        inv.documentType,
        inv.invoiceNumber,
        inv.issueDate,
        inv.dueDate,
        inv.currency,
        inv.seller?.name,
        inv.seller?.taxId,
        inv.buyer?.name,
        inv.buyer?.taxId,
        inv.totals?.taxExclusiveAmount,
        inv.totals?.taxTotalAmount,
        inv.totals?.payableAmount,
        inv.lineItems?.length ?? 0,
        inv.validation?.valid ?? true,
      ]
        .map(escapeCsvCell)
        .join(","),
    );
  }
  return rows.join("\n");
}

export { parseXmlTree } from "./xml.js";
