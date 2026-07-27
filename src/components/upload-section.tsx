"use client";

import { useCallback, useState } from "react";
import { DownloadSimple, FileArrowUp } from "@phosphor-icons/react";
import { LockIcon, CalcIcon, DocIcon } from "./icons";
import { LaneExpectation } from "@/engine/validation/provider-guard";
import { useT } from "@/i18n/locale-provider";
import { RichText } from "@/i18n/rich-text";
import type { TranslationKey } from "@/i18n/translate";

interface UploadSectionProps {
  onAnalyze: (mode: "demo" | "file", file?: File) => void;
  loading: boolean;
  error: string | null;
  /** The lane picked in step 1 — drives the hint copy and the sample download. */
  lane: LaneExpectation;
  /** Controlled by the page so switching lanes doesn't drop the file. */
  selectedFile: File | null;
  onSelectFile: (file: File | null) => void;
  /** Silences the server error when a ProviderMismatchPanel already explains it. */
  suppressServerError?: boolean;
}

const ACCEPTED_EXT = /\.(csv|xlsx|xlsm)$/i;

/**
 * What each lane expects, named explicitly so the user doesn't have to guess.
 *
 * A Record of dictionary keys rather than a template path built from `lane`: the
 * mapping is checked against TranslationKey at compile time, so renaming a key in
 * the dictionary breaks the build here instead of falling back at runtime.
 */
const LANE_HINT_KEY: Record<LaneExpectation, TranslationKey> = {
  aws: "upload.laneHint.aws",
  azure: "upload.laneHint.azure",
  gcp: "upload.laneHint.gcp",
  focus: "upload.laneHint.focus",
};

export function UploadSection({
  onAnalyze,
  loading,
  error,
  lane,
  selectedFile,
  onSelectFile,
  suppressServerError,
}: UploadSectionProps) {
  const t = useT();
  const [dragActive, setDragActive] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const sampleHref = `/api/examples/${lane}`;

  const acceptFile = useCallback(
    (file: File) => {
      if (!ACCEPTED_EXT.test(file.name)) {
        setLocalError(t("errors.notCsvOrExcel", { name: file.name }));
        onSelectFile(null);
        return;
      }
      setLocalError(null);
      onSelectFile(file);
    },
    [onSelectFile, t]
  );

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        acceptFile(e.dataTransfer.files[0]);
      }
    },
    [acceptFile]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) acceptFile(e.target.files[0]);
  };

  const showServerError = !!error && !suppressServerError;

  return (
    <div>
      <div className="card-premium p-6">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h3 className="font-semibold text-ink">{t("upload.title")}</h3>
          <a
            href={sampleHref}
            download
            className="btn-secondary min-h-11 shrink-0"
          >
            <DownloadSimple size={18} aria-hidden="true" />
            {t("upload.sample")}
          </a>
        </div>

        <label
          className={`block cursor-pointer rounded-[14px] border-2 border-dashed p-8 text-center transition-colors duration-200 ease-out focus-within:ring-2 focus-within:ring-brand focus-within:ring-offset-2 ${
            dragActive ? "border-brand bg-brand-soft" : "border-line-strong hover:border-brand hover:bg-brand-soft/40"
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            type="file"
            accept=".csv,.xlsx,.xlsm"
            className="sr-only"
            onChange={handleFileChange}
          />
          <FileArrowUp size={34} weight="regular" className="mx-auto mb-3 text-brand" aria-hidden="true" />
          <p className="text-ink mb-1">
            {/* The picker is part of the sentence, so it travels as a marker:
                English does not put it where Spanish does. */}
            <RichText
              template={t("upload.dropzone")}
              nodes={{
                pick: (
                  <span className="text-brand underline decoration-brand/40 underline-offset-4 font-semibold">
                    {t("upload.dropzonePick")}
                  </span>
                ),
              }}
            />
          </p>
          <p className="text-sm text-ink-muted">{t(LANE_HINT_KEY[lane])}</p>
        </label>

        {selectedFile && (
          <div className="mt-4 flex items-center justify-between bg-surface-2 rounded-xl p-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-medium text-ink truncate">{selectedFile.name}</span>
              <span className="num text-xs text-ink-muted shrink-0">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
            </div>
            <button onClick={() => onSelectFile(null)} className="text-sm text-danger hover:underline shrink-0">{t("upload.removeFile")}</button>
          </div>
        )}

        <button
          onClick={() => selectedFile && onAnalyze("file", selectedFile)}
          disabled={!selectedFile || loading}
          className="btn-primary mt-4 w-full disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? <span className="flex items-center justify-center gap-2"><Spinner /> {t("upload.analyzing")}</span> : t("upload.analyze")}
        </button>
      </div>

      {(localError || showServerError) && (
        <div className="mt-4 bg-danger-soft border border-danger/20 text-danger rounded-[10px] p-4" role="alert" tabIndex={-1}>
          <p className="font-medium">{localError ? t("errors.unsupportedFile") : t("errors.title")}</p>
          {/* `error` is the server's own message: it arrives already written and is
              passed through, not translated a second time here. */}
          <p className="text-sm mt-1">{localError || error}</p>
        </div>
      )}

      {/* Trust line — three points, no cards */}
      <div className="mt-6 flex flex-col sm:flex-row gap-4 sm:gap-8 text-sm">
        <TrustPoint
          icon={<LockIcon className="w-4 h-4" />}
          title={t("upload.trust.privateTitle")}
          desc={t("upload.trust.privateDesc")}
        />
        <TrustPoint icon={<CalcIcon className="w-4 h-4" />} title={t("upload.trust.verifiableTitle")} desc={t("upload.trust.verifiableDesc")} />
        <TrustPoint icon={<DocIcon className="w-4 h-4" />} title={t("upload.trust.auditableTitle")} desc={t("upload.trust.auditableDesc")} />
      </div>
    </div>
  );
}

function TrustPoint({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-2.5 flex-1">
      <span className="text-brand mt-0.5 shrink-0">{icon}</span>
      <div>
        <p className="font-medium text-ink">{title}</p>
        <p className="text-xs text-ink-muted mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

// Only rendered inside the `bg-brand` analyse button, so it takes that fill's ink.
function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5 text-brand-ink" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}
