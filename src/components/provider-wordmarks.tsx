import Image from "next/image";

type WordmarkProps = {
  className?: string;
};

type WordmarkAsset = {
  lightSrc: string;
  darkSrc: string;
  width: number;
  height: number;
};

const ASSETS: Record<"aws" | "azure" | "gcp" | "focus" | "finops", WordmarkAsset> = {
  aws: {
    lightSrc: "/brand/providers/aws-light.png",
    darkSrc: "/brand/providers/aws-dark.png",
    width: 403,
    height: 252,
  },
  azure: {
    lightSrc: "/brand/providers/azure-light.png",
    darkSrc: "/brand/providers/azure-dark.png",
    width: 568,
    height: 184,
  },
  gcp: {
    lightSrc: "/brand/providers/gcp-light.png",
    darkSrc: "/brand/providers/gcp-dark.png",
    width: 568,
    height: 113,
  },
  focus: {
    lightSrc: "/brand/providers/focus-light.png",
    darkSrc: "/brand/providers/focus-dark.png",
    width: 384,
    height: 111,
  },
  finops: {
    lightSrc: "/brand/providers/finops-foundation-light.png",
    darkSrc: "/brand/providers/finops-foundation-dark.png",
    width: 626,
    height: 207,
  },
};

function ProviderWordmark({
  asset,
  className = "h-12 w-44",
}: {
  asset: WordmarkAsset;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-start ${className}`}
      aria-hidden="true"
    >
      <Image
        src={asset.lightSrc}
        alt=""
        width={asset.width}
        height={asset.height}
        className="max-h-full max-w-full object-contain object-left dark:hidden"
      />
      <Image
        src={asset.darkSrc}
        alt=""
        width={asset.width}
        height={asset.height}
        className="hidden max-h-full max-w-full object-contain object-left dark:block"
      />
    </span>
  );
}

export function AwsWordmark({ className }: WordmarkProps) {
  return <ProviderWordmark asset={ASSETS.aws} className={className} />;
}

export function AzureWordmark({ className }: WordmarkProps) {
  return <ProviderWordmark asset={ASSETS.azure} className={className} />;
}

export function GcpWordmark({ className }: WordmarkProps) {
  return <ProviderWordmark asset={ASSETS.gcp} className={className} />;
}

export function FocusWordmark({ className }: WordmarkProps) {
  return <ProviderWordmark asset={ASSETS.focus} className={className} />;
}

export function FinOpsFoundationWordmark({ className }: WordmarkProps) {
  return <ProviderWordmark asset={ASSETS.finops} className={className} />;
}
