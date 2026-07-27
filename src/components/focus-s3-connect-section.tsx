"use client";

import { useMemo, useState } from "react";
import { AuditReport } from "@/engine/types";
import { CheckIcon, LockIcon, SparkleIcon } from "./icons";
import { useT } from "@/i18n/locale-provider";
import { RichText } from "@/i18n/rich-text";

/* Region ids plus the location AWS names them by — identifiers and place names on
   both sides, so this table carries no language. Mirrors aws-connect-section. */
const REGION_OPTIONS = [
  { id: "us-east-1", place: "N. Virginia" },
  { id: "us-west-2", place: "Oregon" },
  { id: "eu-west-1", place: "Ireland" },
  { id: "eu-central-1", place: "Frankfurt" },
  { id: "ap-southeast-1", place: "Singapore" },
  { id: "sa-east-1", place: "São Paulo" },
] as const;

interface FocusS3ConnectSectionProps {
  onConnected: (report: AuditReport, markdown: string, analysisId: string, analysisToken: string) => void;
  loading: boolean;
  setLoading: (v: boolean) => void;
}

/**
 * UI for Phase 3: Connect to AWS Data Exports FOCUS bucket.
 *
 * Console path (verified):
 *   Billing and Cost Management → Data Exports → Create export
 *   → Standard data export → Table: "FOCUS 1.2 with AWS columns"
 *     (or "FOCUS 1.0 with AWS columns")
 *
 * The region selector is the BUCKET's region. us-east-1 is required for the export
 * resource and its control plane, not for the destination bucket:
 *   https://docs.aws.amazon.com/cur/latest/userguide/dataexports-s3-bucket.html
 *
 * SECURITY: Credentials are used ONLY in memory for this request —
 * never stored, never logged, never sent to third parties.
 */

function buildMinimalIamPolicy(bucketValue: string, prefixValue: string): string {
  const bucketName = bucketValue.trim() || "YOUR_BUCKET_NAME";
  const normalizedPrefix = prefixValue.trim().replace(/^\/+|\/+$/g, "");
  const bucketArn = `arn:aws:s3:::${bucketName}`;
  const objectArn = normalizedPrefix
    ? `${bucketArn}/${normalizedPrefix}/*`
    : `${bucketArn}/*`;

  const listStatement: Record<string, unknown> = {
    Sid: "NimbusListFocusExport",
    Effect: "Allow",
    Action: "s3:ListBucket",
    Resource: bucketArn,
  };

  if (normalizedPrefix) {
    listStatement.Condition = {
      StringLike: {
        "s3:prefix": [normalizedPrefix, `${normalizedPrefix}/*`],
      },
    };
  }

  return JSON.stringify(
    {
      Version: "2012-10-17",
      Statement: [
        listStatement,
        {
          Sid: "NimbusReadFocusExport",
          Effect: "Allow",
          Action: "s3:GetObject",
          Resource: objectArn,
        },
      ],
    },
    null,
    2,
  );
}

export function FocusS3ConnectSection({ onConnected, loading, setLoading }: FocusS3ConnectSectionProps) {
  const t = useT();
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [bucket, setBucket] = useState("");
  const [prefix, setPrefix] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [validated, setValidated] = useState(false);
  const [validating, setValidating] = useState(false);
  const [policyCopied, setPolicyCopied] = useState(false);
  const minimalIamPolicy = useMemo(
    () => buildMinimalIamPolicy(bucket, prefix),
    [bucket, prefix],
  );
  const canCopyPolicy = bucket.trim().length > 0;

  const handleCopyPolicy = () => {
    if (!canCopyPolicy) return;
    navigator.clipboard.writeText(minimalIamPolicy);
    setPolicyCopied(true);
    setTimeout(() => setPolicyCopied(false), 2000);
  };

  const handleValidate = async () => {
    setValidating(true);
    setError(null);
    try {
      const resp = await fetch("/api/connect-focus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessKeyId: accessKeyId.trim(),
          secretAccessKey: secretAccessKey.trim(),
          sessionToken: sessionToken.trim() || undefined,
          region,
          bucket: bucket.trim(),
          prefix: prefix.trim(),
          action: "validate",
        }),
      });
      const data = await resp.json();
      if (data.success) {
        setValidated(true);
        setError(null);
      } else {
        setError(data.error || t("errors.validationDot"));
        setValidated(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.connectionDot"));
      setValidated(false);
    } finally {
      setValidating(false);
    }
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    setWarnings([]);
    try {
      const resp = await fetch("/api/connect-focus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessKeyId: accessKeyId.trim(),
          secretAccessKey: secretAccessKey.trim(),
          sessionToken: sessionToken.trim() || undefined,
          region,
          bucket: bucket.trim(),
          prefix: prefix.trim(),
          action: "analyze",
        }),
      });
      const data = await resp.json();
      if (data.success) {
        // Shown even on success: the fallback path can only guarantee "some data",
        // not "the whole export", and the user has to know which one they got.
        if (Array.isArray(data.warnings) && data.warnings.length > 0) {
          setWarnings(data.warnings as string[]);
        }
        onConnected(data.report as AuditReport, data.markdown, data.analysisId, data.analysisToken);
      } else {
        setError(data.error || t("errors.unknownDot"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.connectionDot"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card-premium p-6 mt-4">
      <div className="flex items-center gap-2 mb-3">
        <SparkleIcon className="w-5 h-5 text-brand" />
        <h3 className="text-base font-semibold text-ink">{t("connect.focus.title")}</h3>
      </div>

      {/* Setup guide. Console paths, table names, file formats and the delivery
          mode are what the AWS console calls them, so they stay verbatim inside
          their emphasis spans while the sentences around them are translated. */}
      <div className="bg-brand-soft/60 border border-brand/20 rounded-xl p-3 mb-4 text-sm text-ink-muted">
        <p className="font-medium text-ink mb-1">{t("connect.focus.setupTitle")}</p>
        <p>
          <RichText
            template={t("connect.focus.setupBody")}
            nodes={{
              path: <strong className="text-ink">{t("connect.focus.setupPath")}</strong>,
              altTable: <strong className="text-ink">{t("connect.focus.setupAltTable")}</strong>,
            }}
          />
        </p>
        <p className="mt-1.5">
          <RichText
            template={t("connect.focus.formatsBody")}
            nodes={{
              csv: <strong className="text-ink">{t("connect.focus.formatsCsv")}</strong>,
              parquet: <strong className="text-ink">{t("connect.focus.formatsParquet")}</strong>,
              deliveryMode: <em>{t("connect.focus.formatsDeliveryMode")}</em>,
            }}
          />
        </p>
        <p className="mt-1.5">
          <RichText
            template={t("connect.focus.prefixHelp")}
            nodes={{
              example: <code className="bg-surface-2 px-1 rounded">focus-export/</code>,
              manifest: <code className="bg-surface-2 px-1 rounded">Manifest.json</code>,
              partition: <code className="bg-surface-2 px-1 rounded">BILLING_PERIOD</code>,
            }}
          />
        </p>
      </div>

      {/* Security notice */}
      <div className="bg-positive-soft border border-positive/20 rounded-xl p-3 mb-4 text-sm text-ink-muted">
        <p className="flex items-center gap-1.5 font-medium text-positive mb-1">
          <LockIcon className="w-3.5 h-3.5" /> {t("connect.credentialsTitle")}
        </p>
        <ul className="space-y-0.5 list-disc list-inside">
          <li>{t("connect.focus.bulletReadOnly")}</li>
          <li>
            <RichText
              template={t("connect.focus.bulletInMemory")}
              nodes={{ inMemory: <strong className="text-ink">{t("connect.focus.bulletInMemoryStrong")}</strong> }}
            />
          </li>
          <li>
            <RichText
              template={t("connect.focus.bulletNeverStored")}
              nodes={{ never: <strong className="text-ink">{t("connect.focus.bulletNeverStoredStrong")}</strong> }}
            />
          </li>
        </ul>
      </div>

      <div className="space-y-3">
        {/* Bucket + prefix */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">
              {t("connect.focus.bucketLabel")}
            </label>
            <input
              type="text"
              value={bucket}
              onChange={(e) => { setBucket(e.target.value); setValidated(false); }}
              placeholder={t("connect.focus.bucketPlaceholder")}
              className="w-full px-3 py-2 border border-line-strong rounded-lg text-sm font-mono"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">
              {t("connect.focus.prefixLabel")}
            </label>
            <input
              type="text"
              value={prefix}
              onChange={(e) => { setPrefix(e.target.value); setValidated(false); }}
              placeholder="focus-export/"
              className="w-full px-3 py-2 border border-line-strong rounded-lg text-sm font-mono"
              autoComplete="off"
            />
          </div>
        </div>

        {/* Credentials */}
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Access Key ID</label>
          <input
            type="text"
            value={accessKeyId}
            onChange={(e) => { setAccessKeyId(e.target.value); setValidated(false); }}
            placeholder="AKIAIOSFODNN7EXAMPLE"
            className="w-full px-3 py-2 border border-line-strong rounded-lg text-sm font-mono"
            autoComplete="off"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Secret Access Key</label>
          <input
            type="password"
            value={secretAccessKey}
            onChange={(e) => { setSecretAccessKey(e.target.value); setValidated(false); }}
            placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
            className="w-full px-3 py-2 border border-line-strong rounded-lg text-sm font-mono"
            autoComplete="off"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">
            {/* AWS field name, kept; the parenthetical is translated. */}
            Session Token <span className="text-ink-faint font-normal">{t("connect.focus.sessionTokenOptional")}</span>
          </label>
          <input
            type="password"
            value={sessionToken}
            onChange={(e) => { setSessionToken(e.target.value); setValidated(false); }}
            placeholder={t("connect.sessionTokenPlaceholder")}
            className="w-full px-3 py-2 border border-line-strong rounded-lg text-sm font-mono"
            autoComplete="off"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">
            {t("connect.focus.regionLabel")}{" "}
            <span className="text-ink-faint font-normal">{t("connect.focus.regionHint")}</span>
          </label>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="w-full px-3 py-2 border border-line-strong rounded-lg text-sm"
          >
            {REGION_OPTIONS.map((r) => (
              <option key={r.id} value={r.id}>{`${r.id} (${r.place})`}</option>
            ))}
          </select>
        </div>

        {validated && (
          <div className="bg-positive-soft border border-positive/20 rounded-lg p-3 flex items-center gap-2">
            <CheckIcon className="w-4 h-4 text-positive" />
            <span className="text-sm text-positive">{t("connect.focus.accessConfirmed")}</span>
          </div>
        )}
        {error && (
          <div className="bg-danger-soft border border-danger/20 rounded-lg p-3">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}
        {/* Raw amber here was a duplicate of the `caution` token: amber-800 and
            amber-900 were two weights of the same signal, so both collapse onto
            `text-caution`. */}
        {warnings.length > 0 && (
          <div className="bg-caution-soft border border-caution/30 rounded-lg p-3">
            <p className="text-xs font-medium text-caution mb-1">
              {t("connect.focus.warningsTitle")}
            </p>
            {/* The warnings themselves are written by the connector on the server
                and are printed as they arrive. */}
            <ul className="space-y-1 list-disc list-inside text-sm text-caution">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3 pt-1">
          {!validated ? (
            <button
              onClick={handleValidate}
              disabled={!bucket || !accessKeyId || !secretAccessKey || validating}
              // A button, not a header bar: `bg-ink` inverts to a light fill in dark,
              // so it moves to the brand pair. `hover:bg-ink/85` went with it —
              // a translucent ink hover over a brand fill lands on nothing coherent.
              className="min-h-11 flex-1 rounded-[10px] bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink transition-colors duration-200 ease-out hover:bg-brand-strong disabled:opacity-40"
            >
              {validating ? t("connect.validating") : t("connect.focus.validateCta")}
            </button>
          ) : (
            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="min-h-11 flex-1 rounded-[10px] bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink transition-colors duration-200 ease-out hover:bg-brand-strong disabled:opacity-40"
            >
              {loading ? t("connect.focus.analyzing") : t("connect.focus.analyzeCta")}
            </button>
          )}
        </div>
      </div>

      {/* Minimal IAM policy */}
      <div className="mt-4 rounded-xl ring-1 ring-line overflow-hidden">
        <div className="flex flex-col gap-2 bg-surface-2 px-4 py-3 border-b border-line sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-ink">{t("connect.focus.policyTitle")}</p>
            <p className="mt-1 text-xs text-ink-muted">{t("connect.focus.policyPath")}</p>
          </div>
          <button
            onClick={handleCopyPolicy}
            disabled={!canCopyPolicy}
            aria-describedby={!canCopyPolicy ? "focus-policy-copy-help" : undefined}
            // Two levels in one control: the rest already sat on `bg-surface-3`
            // (slate-100's token), so mapping the slate-200 hover to surface-3 too
            // would have made the hover a no-op. Darker step = `line-strong`.
            className="min-h-11 shrink-0 rounded-[10px] bg-surface-3 px-3 py-1.5 text-xs text-ink transition-colors duration-200 ease-out hover:bg-line-strong disabled:cursor-not-allowed disabled:opacity-45"
          >
            {policyCopied ? t("common.copied") : t("common.copy")}
          </button>
        </div>
        <div className="grid gap-3 border-b border-line bg-surface px-4 py-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-ink-muted">
            {t("connect.focus.policyBucketLabel")}
            <input
              type="text"
              value={bucket}
              onChange={(e) => {
                setBucket(e.target.value);
                setValidated(false);
              }}
              placeholder={t("connect.focus.bucketPlaceholder")}
              className="mt-1.5 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm font-mono text-ink"
              autoComplete="off"
            />
          </label>
          <label className="text-xs font-medium text-ink-muted">
            {t("connect.focus.policyPrefixLabel")}
            <input
              type="text"
              value={prefix}
              onChange={(e) => {
                setPrefix(e.target.value);
                setValidated(false);
              }}
              placeholder="focus-export/"
              className="mt-1.5 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm font-mono text-ink"
              autoComplete="off"
            />
          </label>
          {!canCopyPolicy && (
            <p id="focus-policy-copy-help" className="text-xs text-caution sm:col-span-2">
              {t("connect.focus.policyEnterBucket")}
            </p>
          )}
        </div>
        {/* `ring-1 ring-line` is new: in dark the code fill sits *below* the page
            background, so without an edge the block stops reading as a block. */}
        <pre className="bg-code text-code-ink text-xs p-4 overflow-x-auto ring-1 ring-line">
          {minimalIamPolicy}
        </pre>
        <p className="text-xs text-ink-muted px-4 py-2 border-t border-line">
          {t("connect.focus.policyNote")}
        </p>
      </div>
    </div>
  );
}
