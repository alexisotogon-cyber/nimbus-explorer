#!/usr/bin/env node
/**
 * Generates test fixtures for FinOps Agent.
 * Run: node test-data/generate-fixtures.js
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// ─── FOCUS CSV fixture ────────────────────────────────────────────────────────

function generateFOCUSFixture() {
  const rows = [];
  const headers = [
    "ProviderName", "ServiceName", "ServiceCategory", "SkuId", "ChargeDescription",
    "RegionId", "ChargePeriodStart", "ChargePeriodEnd", "BilledCost", "EffectiveCost",
    "ConsumedQuantity", "ConsumedUnit", "ChargeCategory", "SubAccountId",
    "CommitmentDiscountId", "ResourceId", "ResourceType", "BillingAccountId",
  ];
  rows.push(headers.join(","));

  const baseDate = new Date("2026-06-21");

  for (let day = 0; day < 30; day++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + day);
    const dateStr = d.toISOString().split("T")[0];
    const nextDateStr = new Date(d.getTime() + 86400000).toISOString().split("T")[0];

    // AWS EC2 compute
    rows.push([
      "Amazon", "Amazon EC2", "Compute", "EC2-BoxUsage:m6i.xlarge",
      "EC2 Instance Running m6i.xlarge", "us-east-1",
      dateStr, nextDateStr, (4.608 + (Math.random() - 0.5) * 0.5).toFixed(6),
      (4.608).toFixed(6), "24", "Hrs", "Usage", "123456789012", "", "i-0abc123", "EC2 Instance", "123456789012",
    ].join(","));

    // AWS S3 storage
    rows.push([
      "Amazon", "Amazon S3", "Storage", "S3-TimedStorage-ByteHrs",
      "S3 Standard Storage", "us-east-1",
      dateStr, nextDateStr, (7.67).toFixed(6),
      (7.67).toFixed(6), "10000000000", "Byte-Hrs", "Usage", "123456789012", "", "", "S3 Bucket", "123456789012",
    ].join(","));

    // AWS EBS snapshots
    rows.push([
      "Amazon", "Amazon EC2", "Storage", "EBS-SnapshotUsage",
      "EBS Snapshot Storage", "us-east-1",
      dateStr, nextDateStr, (8.33).toFixed(6),
      (8.33).toFixed(6), "5000", "GB-Mo", "Usage", "123456789012", "", "", "EBS Snapshot", "123456789012",
    ].join(","));

    // AWS NAT Gateway
    rows.push([
      "Amazon", "Amazon VPC", "Networking", "USE1-NatGateway-Bytes",
      "NAT Gateway Data Processed", "us-east-1",
      dateStr, nextDateStr, (22.5 + (Math.random() - 0.5) * 2).toFixed(6),
      (22.5).toFixed(6), "500", "GB", "Usage", "123456789012", "", "", "NAT Gateway", "123456789012",
    ].join(","));

    // AWS Bedrock (AI/ML)
    rows.push([
      "Amazon", "Amazon Bedrock", "AI and Machine Learning", "BDR-InputTokens-claude-sonnet",
      "Bedrock On-Demand Input Tokens Claude", "us-east-1",
      dateStr, nextDateStr, (8.33 + (Math.random() - 0.5) * 2).toFixed(6),
      (8.33).toFixed(6), "10000000", "Input Tokens", "Usage", "123456789012", "", "", "Bedrock Model", "123456789012",
    ].join(","));

    // Azure VM compute (second provider to test multi-provider FOCUS)
    rows.push([
      "Microsoft", "Virtual Machines", "Compute", "Standard_D4s_v5",
      "Virtual Machines D4s v5 - eastus", "eastus",
      dateStr, nextDateStr, (5.2 + (Math.random() - 0.5) * 0.5).toFixed(6),
      (5.2).toFixed(6), "24", "Hours", "Usage", "sub-demo-001", "", "/subscriptions/sub-demo/vm/myvm", "Virtual Machine", "billing-001",
    ].join(","));

    // Record with CommitmentDiscountId (should suppress missing-commitment rule)
    if (day === 0) {
      rows.push([
        "Amazon", "Amazon EC2", "Compute", "ComputeSP-Usage",
        "Compute Savings Plan covered usage", "us-east-1",
        dateStr, nextDateStr, (3.0).toFixed(6),
        (3.0).toFixed(6), "24", "Hrs", "Usage", "123456789012", "sp-00abc12345", "i-0xyz789", "EC2 Instance", "123456789012",
      ].join(","));
    }
  }

  return rows.join("\n");
}

// ─── AWS native CSV fixture ───────────────────────────────────────────────────

function generateAWSNativeFixture() {
  const rows = [];
  rows.push("Date,Service,UsageType,Region,AccountId,UsageQuantity,UnblendedCost,ChargeType");

  const baseDate = new Date("2026-06-21");
  for (let day = 0; day < 30; day++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + day);
    const dateStr = d.toISOString().split("T")[0];

    rows.push(`${dateStr},Amazon EC2,BoxUsage:m6i.xlarge,us-east-1,123456789012,24,${(4.608 + (Math.random()-0.5)*0.5).toFixed(6)},Usage`);
    rows.push(`${dateStr},Amazon S3,TimedStorage-ByteHrs,us-east-1,123456789012,10000000000,7.670000,Usage`);
    rows.push(`${dateStr},Amazon EC2,EBS:VolumeUsage.gp3,us-east-1,123456789012,2000,5.330000,Usage`);
    rows.push(`${dateStr},Amazon EC2,EBS:SnapshotUsage,us-east-1,123456789012,5000,8.330000,Usage`);
    rows.push(`${dateStr},Amazon EC2,NatGateway-Bytes,us-east-1,123456789012,500,${(22.5+(Math.random()-0.5)*2).toFixed(6)},Usage`);
    rows.push(`${dateStr},Amazon EC2,BoxUsage:t2.xlarge,us-west-2,123456789012,24,${(4.45+(Math.random()-0.5)*0.5).toFixed(6)},Usage`);
    rows.push(`${dateStr},Amazon EC2,ElasticIP:IdleAddress,us-east-1,123456789012,48,0.240000,Usage`);
  }

  return rows.join("\n");
}

// ─── Write files ──────────────────────────────────────────────────────────────

const dir = path.join(__dirname);

const focusCSV = generateFOCUSFixture();
fs.writeFileSync(path.join(dir, "caso-prueba-focus.csv"), focusCSV, "utf8");
console.log("✓ caso-prueba-focus.csv written");

const awsCSV = generateAWSNativeFixture();
fs.writeFileSync(path.join(dir, "caso-prueba-aws.csv"), awsCSV, "utf8");
console.log("✓ caso-prueba-aws.csv written");

const gzipped = zlib.gzipSync(Buffer.from(focusCSV, "utf8"));
fs.writeFileSync(path.join(dir, "focus-export-sample.csv.gz"), gzipped);
console.log("✓ focus-export-sample.csv.gz written");

console.log("\nAll fixtures generated.");
