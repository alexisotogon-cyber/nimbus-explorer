#!/usr/bin/env bash
set -euo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
project_root="$(cd "$script_dir/.." && pwd)"

set -a
# Keep secrets in the ignored local environment file, never in mcp.json.
source "$project_root/.env.local"
set +a

export AWS_ACCESS_KEY_ID="${AWS_PRICING_ACCESS_KEY_ID:?AWS_PRICING_ACCESS_KEY_ID is required}"
export AWS_SECRET_ACCESS_KEY="${AWS_PRICING_SECRET_ACCESS_KEY:?AWS_PRICING_SECRET_ACCESS_KEY is required}"
export AWS_REGION="${AWS_PRICING_REGION:-us-east-1}"
export AWS_DEFAULT_REGION="$AWS_REGION"

exec uvx awslabs.aws-pricing-mcp-server@latest "$@"
