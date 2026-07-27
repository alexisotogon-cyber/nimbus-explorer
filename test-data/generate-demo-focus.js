#!/usr/bin/env node
/**
 * Genera un CSV en formato FOCUS para el conector S3 en vivo, pensado para
 * demo/video: gasto en IA (Bedrock On-Demand + SageMaker endpoint + GPU
 * siempre encendida), créditos/reembolsos reales, y dos hallazgos grandes
 * (NAT Gateway + Compute Savings Plans) para que el ahorro total impresione.
 * Run: node test-data/generate-demo-focus.js
 */
const fs = require("fs");
const path = require("path");

const headers = [
  "ProviderName", "ServiceName", "ServiceCategory", "SkuId", "ChargeDescription",
  "RegionId", "ChargePeriodStart", "ChargePeriodEnd", "BilledCost", "EffectiveCost",
  "ConsumedQuantity", "ConsumedUnit", "ChargeCategory", "SubAccountId",
  "CommitmentDiscountId", "ResourceId", "ResourceType", "BillingAccountId", "Tags",
];

function row(fields) {
  return headers.map((h) => {
    const v = fields[h] ?? "";
    return typeof v === "string" && v.includes(",") ? `"${v}"` : v;
  }).join(",");
}

const rows = [headers.join(",")];
const baseDate = new Date("2026-06-27");
const ACCOUNT = "558214039201";

for (let day = 0; day < 30; day++) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + day);
  const dateStr = d.toISOString().split("T")[0];
  const nextDateStr = new Date(d.getTime() + 86400000).toISOString().split("T")[0];
  const jitter = (base, pct = 0.06) => (base * (1 + (Math.random() - 0.5) * pct)).toFixed(6);

  // ── NAT Gateway: costo de salida a internet (hallazgo grande, fácil de explicar) ──
  rows.push(row({
    ProviderName: "Amazon", ServiceName: "Amazon VPC", ServiceCategory: "Networking",
    SkuId: "NatGateway-Hours", ChargeDescription: "NAT Gateway Hours + Data Processed",
    RegionId: "us-east-1", ChargePeriodStart: dateStr, ChargePeriodEnd: nextDateStr,
    BilledCost: jitter(26.4), EffectiveCost: jitter(26.4), ConsumedQuantity: "24",
    ConsumedUnit: "Hrs", ChargeCategory: "Usage", SubAccountId: ACCOUNT,
    CommitmentDiscountId: "", ResourceId: "nat-0a3f8b2c91d4e7f56", ResourceType: "NAT Gateway",
    BillingAccountId: ACCOUNT, Tags: "",
  }));

  // ── EC2 always-on, sin Savings Plan (hallazgo de compromiso faltante) ──
  rows.push(row({
    ProviderName: "Amazon", ServiceName: "Amazon EC2", ServiceCategory: "Compute",
    SkuId: "BoxUsage:m6i.2xlarge", ChargeDescription: "EC2 Instance Running m6i.2xlarge",
    RegionId: "us-east-1", ChargePeriodStart: dateStr, ChargePeriodEnd: nextDateStr,
    BilledCost: jitter(34.5), EffectiveCost: jitter(34.5), ConsumedQuantity: "24",
    ConsumedUnit: "Hrs", ChargeCategory: "Usage", SubAccountId: ACCOUNT,
    CommitmentDiscountId: "", ResourceId: "i-0b7e2d4f8a91c3560", ResourceType: "EC2 Instance",
    BillingAccountId: ACCOUNT, Tags: "env=production,team=platform",
  }));

  // ── Unattached EBS volume (waste evidente) ──
  rows.push(row({
    ProviderName: "Amazon", ServiceName: "Amazon EC2", ServiceCategory: "Storage",
    SkuId: "EBS:VolumeUsage.gp3", ChargeDescription: "EBS gp3 Volume Storage (unattached)",
    RegionId: "us-east-1", ChargePeriodStart: dateStr, ChargePeriodEnd: nextDateStr,
    BilledCost: jitter(3.2), EffectiveCost: jitter(3.2), ConsumedQuantity: "400",
    ConsumedUnit: "GB-Mo", ChargeCategory: "Usage", SubAccountId: ACCOUNT,
    CommitmentDiscountId: "", ResourceId: "vol-0c9d4e7f1a2b3c856", ResourceType: "EBS Volume",
    BillingAccountId: ACCOUNT, Tags: "",
  }));

  // ── Bedrock On-Demand — gasto alto, sin tags (dispara AI-BDR-001 + AI-TAG-001) ──
  rows.push(row({
    ProviderName: "Amazon", ServiceName: "Amazon Bedrock", ServiceCategory: "AI and Machine Learning",
    SkuId: "anthropic.claude-sonnet-4-input-tokens", ChargeDescription: "Bedrock On-Demand Inference — Claude Sonnet",
    RegionId: "us-east-1", ChargePeriodStart: dateStr, ChargePeriodEnd: nextDateStr,
    BilledCost: jitter(84.3), EffectiveCost: jitter(84.3), ConsumedQuantity: "1850000",
    ConsumedUnit: "Tokens", ChargeCategory: "Usage", SubAccountId: ACCOUNT,
    CommitmentDiscountId: "", ResourceId: "", ResourceType: "Bedrock Model Invocation",
    BillingAccountId: ACCOUNT, Tags: "",
  }));

  // ── SageMaker endpoint 24/7 (dispara AI-SM-001) ──
  rows.push(row({
    ProviderName: "Amazon", ServiceName: "Amazon SageMaker", ServiceCategory: "AI and Machine Learning",
    SkuId: "SageMaker:ml.g5.xlarge-Endpoint", ChargeDescription: "SageMaker Real-Time Inference Endpoint",
    RegionId: "us-east-1", ChargePeriodStart: dateStr, ChargePeriodEnd: nextDateStr,
    BilledCost: jitter(47.5, 0.02), EffectiveCost: jitter(47.5, 0.02), ConsumedQuantity: "24",
    ConsumedUnit: "Hrs", ChargeCategory: "Usage", SubAccountId: ACCOUNT,
    CommitmentDiscountId: "", ResourceId: "endpoint-nimbus-classifier-prod", ResourceType: "SageMaker Endpoint",
    BillingAccountId: ACCOUNT, Tags: "",
  }));

  // ── GPU EC2 siempre encendida (dispara AI-GPU-001, patrón BoxUsage:[pg]\d) ──
  rows.push(row({
    ProviderName: "Amazon", ServiceName: "Amazon EC2", ServiceCategory: "Compute",
    SkuId: "BoxUsage:g5.xlarge", ChargeDescription: "EC2 Instance Running g5.xlarge (GPU)",
    RegionId: "us-east-1", ChargePeriodStart: dateStr, ChargePeriodEnd: nextDateStr,
    BilledCost: jitter(60.2, 0.02), EffectiveCost: jitter(60.2, 0.02), ConsumedQuantity: "24",
    ConsumedUnit: "Hrs", ChargeCategory: "Usage", SubAccountId: ACCOUNT,
    CommitmentDiscountId: "", ResourceId: "i-0d1e5f8a2b3c4d967", ResourceType: "EC2 Instance",
    BillingAccountId: ACCOUNT, Tags: "",
  }));

  // ── Créditos/reembolsos: solo en la segunda mitad del periodo (evento real, no ruido diario) ──
  if (day >= 15 && day < 18) {
    rows.push(row({
      ProviderName: "Amazon", ServiceName: "Amazon EC2", ServiceCategory: "Compute",
      SkuId: "Credit:PromoCredit", ChargeDescription: "Crédito promocional aplicado — reembolso de soporte",
      RegionId: "us-east-1", ChargePeriodStart: dateStr, ChargePeriodEnd: nextDateStr,
      BilledCost: "-45.000000", EffectiveCost: "-45.000000", ConsumedQuantity: "1",
      ConsumedUnit: "Credit", ChargeCategory: "Credit", SubAccountId: ACCOUNT,
      CommitmentDiscountId: "", ResourceId: "", ResourceType: "",
      BillingAccountId: ACCOUNT, Tags: "",
    }));
  }
}

const outPath = path.join(__dirname, "demo-focus-s3-showcase.csv");
fs.writeFileSync(outPath, rows.join("\n") + "\n");
console.log(`Escrito: ${outPath}`);
console.log(`Filas: ${rows.length - 1}`);
