import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { einvoicesToCsv, parseEinvoice, validateEinvoiceTotals } from "../src/index.js";

const execFileAsync = promisify(execFile);

const PEPPOL_BIS3_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>INV-2026-0042</cbc:ID>
  <cbc:IssueDate>2026-11-20</cbc:IssueDate>
  <cbc:DueDate>2026-12-20</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cbc:BuyerReference>PO-9910</cbc:BuyerReference>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0088">7300010000001</cbc:EndpointID>
      <cac:PostalAddress>
        <cbc:StreetName>Friedrichstrasse 123</cbc:StreetName>
        <cbc:CityName>Berlin</cbc:CityName>
        <cbc:PostalZone>10117</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>DE</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme><cbc:CompanyID>DE123456789</cbc:CompanyID></cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Nordic Cloud GmbH &amp; Co.</cbc:RegistrationName>
        <cbc:CompanyID>HRB-88991</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PostalAddress>
        <cbc:CityName>Amsterdam</cbc:CityName>
        <cac:Country><cbc:IdentificationCode>NL</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme><cbc:CompanyID>NL998877665B01</cbc:CompanyID></cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>Delta Logistics BV</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>
    <cbc:PaymentID>RF18539007547034</cbc:PaymentID>
    <cac:PayeeFinancialAccount>
      <cbc:ID>DE89370400440532013000</cbc:ID>
      <cbc:Name>Nordic Cloud GmbH</cbc:Name>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="EUR">380.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="EUR">2000.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="EUR">380.00</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>19</cbc:Percent>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="EUR">2000.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="EUR">2000.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="EUR">2380.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="EUR">2380.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="HUR">20</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="EUR">2000.00</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>Enterprise Peppol Gateway Integration</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>19</cbc:Percent>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="EUR">100.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

const XRECHNUNG_CII_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
                          xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
                          xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>XR-2026-8801</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">20261115</udt:DateTimeString></ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument><ram:LineID>1</ram:LineID></ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct><ram:Name>Dedicated Worker Cluster</ram:Name></ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice><ram:ChargeAmount>500.00</ram:ChargeAmount></ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="C62">2</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>19</ram:RateApplicablePercent></ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>1000.00</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:BuyerReference>04011000-12345-03</ram:BuyerReference>
      <ram:SellerTradeParty>
        <ram:Name>Spree Systems AG</ram:Name>
        <ram:PostalTradeAddress><ram:CountryID>DE</ram:CountryID></ram:PostalTradeAddress>
        <ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">DE811222333</ram:ID></ram:SpecifiedTaxRegistration>
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty><ram:Name>Bundesamt Digital</ram:Name></ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>190.00</ram:CalculatedAmount>
        <ram:BasisAmount>1000.00</ram:BasisAmount>
        <ram:CategoryCode>S</ram:CategoryCode>
        <ram:RateApplicablePercent>19</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>1000.00</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>1000.00</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">190.00</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>1190.00</ram:GrandTotalAmount>
        <ram:DuePayableAmount>1190.00</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;

const FATTURAPA_XML = `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2">
  <FatturaElettronicaHeader>
    <DatiTrasmissione>
      <FormatoTrasmissione>FPR12</FormatoTrasmissione>
      <CodiceDestinatario>ABC1234</CodiceDestinatario>
    </DatiTrasmissione>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Milano Software S.r.l.</Denominazione></Anagrafica>
      </DatiAnagrafici>
      <Sede><Indirizzo>Via Torino 10</Indirizzo><CAP>20123</CAP><Comune>Milano</Comune><Nazione>IT</Nazione></Sede>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>09876543210</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Roma Retail S.p.A.</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>2026-11-18</Data>
        <Numero>FPA-2026/77</Numero>
        <ImportoTotaleDocumento>1220.00</ImportoTotaleDocumento>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DettaglioLinee>
        <NumeroLinea>1</NumeroLinea>
        <Descrizione>Licenza LedgerFlow SaaS</Descrizione>
        <Quantita>1.00</Quantita>
        <PrezzoUnitario>1000.00</PrezzoUnitario>
        <PrezzoTotale>1000.00</PrezzoTotale>
        <AliquotaIVA>22.00</AliquotaIVA>
      </DettaglioLinee>
      <DatiRiepilogo>
        <AliquotaIVA>22.00</AliquotaIVA>
        <ImponibileImporto>1000.00</ImponibileImporto>
        <Imposta>220.00</Imposta>
      </DatiRiepilogo>
    </DatiBeniServizi>
    <DatiPagamento>
      <DettaglioPagamento>
        <ModalitaPagamento>MP05</ModalitaPagamento>
        <DataScadenzaPagamento>2026-12-18</DataScadenzaPagamento>
        <ImportoPagamento>1220.00</ImportoPagamento>
        <IBAN>IT60X0542811101000000123456</IBAN>
      </DettaglioPagamento>
    </DatiPagamento>
  </FatturaElettronicaBody>
</p:FatturaElettronica>`;

const VN_GDT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<HDon>
  <DLHDon Id="ID1">
    <TTChung>
      <PBan>2.0.1</PBan>
      <KHMSHDon>1</KHMSHDon>
      <KHHDon>C26TAA</KHHDon>
      <SHDon>00012890</SHDon>
      <NLap>2026-11-22</NLap>
      <DVTTe>VND</DVTTe>
      <HTTToan>TM/CK</HTTToan>
    </TTChung>
    <NDHDon>
      <NBan>
        <Ten>CÔNG TY TNHH CÔNG NGHỆ SỐ Á CHÂU</Ten>
        <MST>0316889900</MST>
        <DChi>Quận 1, TP. Hồ Chí Minh</DChi>
      </NBan>
      <NMua>
        <Ten>CÔNG TY CỔ PHẦN THƯƠNG MẠI ĐẠI VIỆT</Ten>
        <MST>0109887766</MST>
      </NMua>
      <DSHHDVu>
        <HHDVu>
          <STT>1</STT>
          <THHDVu>Dịch vụ kế toán điện tử tự động</THHDVu>
          <DVTinh>Gói</DVTinh>
          <SLuong>2</SLuong>
          <DGia>5000000</DGia>
          <ThTien>10000000</ThTien>
          <TSuat>8%</TSuat>
        </HHDVu>
      </DSHHDVu>
      <TToan>
        <THTTLTSuat>
          <LTSuat>
            <TSuat>8%</TSuat>
            <ThTien>10000000</ThTien>
            <TThue>800000</TThue>
          </LTSuat>
        </THTTLTSuat>
        <TgTCThue>10000000</TgTCThue>
        <TgTThue>800000</TgTThue>
        <TgTTTBSo>10800000</TgTTTBSo>
      </TToan>
    </NDHDon>
  </DLHDon>
</HDon>`;

test("parses Peppol BIS Billing 3.0 UBL 2.1 invoice and decodes XML entities", () => {
  const inv = parseEinvoice(PEPPOL_BIS3_XML);
  assert.equal(inv.format, "peppol-bis-3");
  assert.equal(inv.invoiceNumber, "INV-2026-0042");
  assert.equal(inv.seller.name, "Nordic Cloud GmbH & Co.");
  assert.equal(inv.seller.taxId, "DE123456789");
  assert.equal(inv.buyer.taxId, "NL998877665B01");
  assert.equal(inv.totals.payableAmount, 2380);
  assert.equal(inv.paymentMeans?.iban, "DE89370400440532013000");
  assert.equal(inv.validation.valid, true);
});

test("parses XRechnung UN/CEFACT CrossIndustryInvoice (CII) with 102 date normalization", () => {
  const inv = parseEinvoice(XRECHNUNG_CII_XML);
  assert.equal(inv.format, "xrechnung-cii");
  assert.equal(inv.issueDate, "2026-11-15");
  assert.equal(inv.buyerReference, "04011000-12345-03");
  assert.equal(inv.lineItems.length, 1);
  assert.equal(inv.lineItems[0].lineTotal, 1000);
  assert.equal(inv.totals.taxTotalAmount, 190);
  assert.equal(inv.totals.payableAmount, 1190);
  assert.equal(inv.validation.valid, true);
});

test("parses Italian FatturaPA v1.2 XML invoice", () => {
  const inv = parseEinvoice(FATTURAPA_XML);
  assert.equal(inv.format, "fatturapa");
  assert.equal(inv.invoiceNumber, "FPA-2026/77");
  assert.equal(inv.seller.taxId, "IT01234567890");
  assert.equal(inv.totals.taxExclusiveAmount, 1000);
  assert.equal(inv.totals.taxTotalAmount, 220);
  assert.equal(inv.totals.payableAmount, 1220);
  assert.equal(inv.validation.valid, true);
});

test("parses Vietnam GDT Circular 78 XML e-invoice (HDon / DLHDon)", () => {
  const inv = parseEinvoice(VN_GDT_XML);
  assert.equal(inv.format, "vn-gdt-xml");
  assert.equal(inv.profileId, "1-C26TAA");
  assert.equal(inv.invoiceNumber, "00012890");
  assert.equal(inv.currency, "VND");
  assert.equal(inv.seller.taxId, "0316889900");
  assert.equal(inv.lineItems[0].taxRate, 8);
  assert.equal(inv.totals.payableAmount, 10800000);
  assert.equal(inv.validation.valid, true);
});

test("detects arithmetic tampering in validateEinvoiceTotals", () => {
  const inv = parseEinvoice(PEPPOL_BIS3_XML);
  inv.totals.payableAmount = 9999;
  const check = validateEinvoiceTotals(inv);
  assert.equal(check.valid, false);
  assert.ok(check.errors.some((e) => e.includes("Payable amount")));
});

test("exports multiple invoices to CSV and runs CLI end-to-end", async () => {
  const csv = einvoicesToCsv([parseEinvoice(PEPPOL_BIS3_XML), parseEinvoice(VN_GDT_XML)]);
  const lines = csv.trim().split("\n");
  assert.equal(lines.length, 3);
  assert.ok(lines[1].includes("INV-2026-0042"));
  assert.ok(lines[2].includes("0316889900"));

  const tmp = await mkdtemp(path.join(tmpdir(), "peppol-test-"));
  try {
    const samplePath = path.join(tmp, "sample.xml");
    await writeFile(samplePath, PEPPOL_BIS3_XML, "utf8");
    const cliPath = path.resolve(import.meta.dirname, "../bin/peppol-einvoice.js");
    const { stdout } = await execFileAsync(process.execPath, [cliPath, "--validate", samplePath]);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.invoiceNumber, "INV-2026-0042");
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
