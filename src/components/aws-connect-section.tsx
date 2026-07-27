"use client";

import { useState } from "react";
import { CheckIcon, LockIcon } from "./icons";
import { useT } from "@/i18n/locale-provider";
import { RichText } from "@/i18n/rich-text";

/* Period options for the Cost Explorer window. The numbers are the values; the
   label is one interpolated sentence, so there is a single key for five options. */
const PERIOD_DAYS = [7, 14, 30, 60, 90] as const;

/* AWS region ids with the location AWS itself names them by. Both halves are
   identifiers/place names, identical in every language, so this list stays out of
   the dictionary. Shared shape with the FOCUS connector on purpose. */
const REGION_OPTIONS = [
  { id: "us-east-1", place: "N. Virginia" },
  { id: "us-west-2", place: "Oregon" },
  { id: "eu-west-1", place: "Ireland" },
  { id: "eu-central-1", place: "Frankfurt" },
  { id: "ap-southeast-1", place: "Singapore" },
  { id: "sa-east-1", place: "São Paulo" },
] as const;

interface AWSConnectSectionProps {
  onConnected: (report: unknown, markdown: string, analysisId: string, analysisToken: string) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
}

export function AWSConnectSection({ onConnected, loading, setLoading }: AWSConnectSectionProps) {
  const t = useT();
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [days, setDays] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [validated, setValidated] = useState(false);
  const [validating, setValidating] = useState(false);

  const handleValidate = async () => {
    setValidating(true);
    setError(null);
    try {
      const response = await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessKeyId: accessKeyId.trim(),
          secretAccessKey: secretAccessKey.trim(),
          sessionToken: sessionToken.trim() || undefined,
          region,
          action: "validate",
        }),
      });
      const data = await response.json();
      if (data.success) {
        setValidated(true);
        setError(null);
      } else {
        setError(data.error || t("errors.validation"));
        setValidated(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.connection"));
      setValidated(false);
    } finally {
      setValidating(false);
    }
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    try {
      const endDate = new Date().toISOString().split("T")[0];
      const startDateObj = new Date();
      startDateObj.setDate(startDateObj.getDate() - days);
      const startDate = startDateObj.toISOString().split("T")[0];

      const response = await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessKeyId: accessKeyId.trim(),
          secretAccessKey: secretAccessKey.trim(),
          sessionToken: sessionToken.trim() || undefined,
          region,
          startDate,
          endDate,
          action: "analyze",
        }),
      });
      const data = await response.json();
      if (data.success) {
        onConnected(data.report, data.markdown, data.analysisId, data.analysisToken);
      } else {
        setError(data.error || t("errors.unknown"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.connection"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card-premium p-6">
      <div className="flex items-center gap-2 mb-4">
        <LockIcon className="w-5 h-5 text-ink-muted" />
        <h3 className="text-lg font-semibold text-ink">{t("connect.aws.title")}</h3>
      </div>

      {/* Explicit security notice */}
      <div className="bg-positive-soft border border-positive/20 rounded-xl p-4 mb-6">
        <p className="flex items-center gap-1.5 text-sm text-positive font-medium mb-1">
          <LockIcon className="w-3.5 h-3.5" /> {t("connect.credentialsTitle")}
        </p>
        {/* Each bullet emphasises one span. The emphasis travels as a marker so the
            English sentence can put it where English puts it. */}
        <ul className="text-sm text-ink-muted space-y-1 list-disc list-inside">
          <li>
            <RichText
              template={t("connect.aws.bulletReadOnly")}
              nodes={{ readOnly: <strong className="text-ink">{t("connect.aws.bulletReadOnlyStrong")}</strong> }}
            />
          </li>
          <li>
            <RichText
              template={t("connect.aws.bulletInMemory")}
              nodes={{ inMemory: <strong className="text-ink">{t("connect.aws.bulletInMemoryStrong")}</strong> }}
            />
          </li>
          <li>
            <RichText
              template={t("connect.aws.bulletNeverStored")}
              nodes={{ never: <strong className="text-ink">{t("connect.aws.bulletNeverStoredStrong")}</strong> }}
            />
          </li>
          <li>{t("connect.aws.bulletNoThirdParties")}</li>
        </ul>
        <p className="text-xs text-ink-muted mt-2">
          <RichText
            template={t("connect.aws.recommended")}
            nodes={{ permission: <code className="bg-surface px-1 rounded">ce:GetCostAndUsage</code> }}
          />
        </p>
      </div>

      {/* Minimal IAM policy — copyable */}
      <MinimalIamPolicy />

      <div className="space-y-4">
        {/* Access Key */}
        <div>
          <label htmlFor="accessKeyId" className="block text-sm font-medium text-ink-muted mb-1">
            Access Key ID
          </label>
          <input
            id="accessKeyId"
            type="text"
            value={accessKeyId}
            onChange={(e) => { setAccessKeyId(e.target.value); setValidated(false); }}
            placeholder="AKIAIOSFODNN7EXAMPLE"
            className="w-full px-3 py-2 border border-line-strong rounded-lg text-sm focus:ring-2 focus:ring-brand/40 focus:border-brand font-mono"
            autoComplete="off"
          />
        </div>

        {/* Secret Key */}
        <div>
          <label htmlFor="secretKey" className="block text-sm font-medium text-ink-muted mb-1">
            Secret Access Key
          </label>
          <input
            id="secretKey"
            type="password"
            value={secretAccessKey}
            onChange={(e) => { setSecretAccessKey(e.target.value); setValidated(false); }}
            placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
            className="w-full px-3 py-2 border border-line-strong rounded-lg text-sm focus:ring-2 focus:ring-brand/40 focus:border-brand font-mono"
            autoComplete="off"
          />
        </div>

        {/* Session Token (optional) */}
        <div>
          <label htmlFor="sessionToken" className="block text-sm font-medium text-ink-muted mb-1">
            {/* "Session Token" is the AWS field name, so it is not translated;
                the parenthetical that explains it is. */}
            Session Token <span className="text-ink-faint font-normal">{t("connect.aws.sessionTokenOptional")}</span>
          </label>
          <input
            id="sessionToken"
            type="password"
            value={sessionToken}
            onChange={(e) => { setSessionToken(e.target.value); setValidated(false); }}
            placeholder={t("connect.sessionTokenPlaceholder")}
            className="w-full px-3 py-2 border border-line-strong rounded-lg text-sm focus:ring-2 focus:ring-brand/40 focus:border-brand font-mono"
            autoComplete="off"
          />
        </div>

        {/* Region + Days */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="region" className="block text-sm font-medium text-ink-muted mb-1">
              {t("connect.aws.regionLabel")}
            </label>
            <select
              id="region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="w-full px-3 py-2 border border-line-strong rounded-lg text-sm"
            >
              {REGION_OPTIONS.map((r) => (
                <option key={r.id} value={r.id}>{`${r.id} (${r.place})`}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="days" className="block text-sm font-medium text-ink-muted mb-1">
              {t("connect.aws.periodLabel")}
            </label>
            <select
              id="days"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-full px-3 py-2 border border-line-strong rounded-lg text-sm"
            >
              {PERIOD_DAYS.map((d) => (
                <option key={d} value={d}>{t("connect.aws.periodOption", { count: d })}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Validation status */}
        {validated && (
          <div className="bg-positive-soft border border-positive/20 rounded-lg p-3 flex items-center gap-2">
            <CheckIcon className="w-4 h-4 text-positive" />
            <span className="text-sm text-positive">{t("connect.aws.credentialsValid")}</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-danger-soft border border-danger/20 rounded-lg p-3">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3 pt-2">
          {!validated ? (
            <button
              onClick={handleValidate}
              disabled={!accessKeyId || !secretAccessKey || validating}
              // Button, not a header: `bg-ink` inverts to a light fill in dark, so it
              // takes the brand pair. `hover:bg-ink/85` follows it to `brand-strong`.
              className="min-h-11 flex-1 rounded-[10px] bg-brand px-6 py-3 font-semibold text-brand-ink transition-colors duration-200 ease-out hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-40"
            >
              {validating ? t("connect.validating") : t("connect.aws.validateCta")}
            </button>
          ) : (
            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="min-h-11 flex-1 rounded-[10px] bg-brand px-6 py-3 font-semibold text-brand-ink transition-colors duration-200 ease-out hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? t("connect.aws.analyzing") : t("connect.aws.analyzeCta", { days })}
            </button>
          )}
        </div>
      </div>

    </div>
  );
}

/** Minimal read-only IAM policy for the only Cost Explorer operation Nimbus calls. */
const MINIMAL_IAM_POLICY = `{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "NimbusCostExplorerReadOnly",
    "Effect": "Allow",
    "Action": "ce:GetCostAndUsage",
    "Resource": "*"
  }]
}`;

function MinimalIamPolicy() {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(MINIMAL_IAM_POLICY);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mb-6 rounded-xl ring-1 ring-line overflow-hidden">
      <div className="flex flex-col gap-2 bg-surface-2 px-4 py-3 border-b border-line sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-ink">{t("connect.aws.policyTitle")}</p>
          <p className="mt-1 text-xs text-ink-muted">{t("connect.aws.policyPath")}</p>
        </div>
        <button
          onClick={handleCopy}
          // Same two-level case as the FOCUS panel: the base is already surface-3,
          // so the slate-200 hover becomes `line-strong` to stay a visible step.
          className="min-h-11 rounded-[10px] bg-surface-3 px-3 py-1.5 text-xs text-ink transition-colors duration-200 ease-out hover:bg-line-strong"
        >
          {copied ? t("common.copied") : t("common.copy")}
        </button>
      </div>
      {/* `ring-1 ring-line` is new: the dark `code` fill sits below the page
          background and needs an edge to keep reading as a block. */}
      <pre className="bg-code text-code-ink text-xs p-4 overflow-x-auto ring-1 ring-line">
{MINIMAL_IAM_POLICY}
      </pre>
      <p className="text-xs text-ink-muted px-4 py-2 border-t border-line">
        <RichText
          template={t("connect.aws.policyNote")}
          nodes={{ permission: <code className="bg-surface-2 px-1 rounded">ce:GetCostAndUsage</code> }}
        />
      </p>
    </div>
  );
}
