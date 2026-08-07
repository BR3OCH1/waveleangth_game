#!/usr/bin/env pwsh
# deploy-backend.ps1
# Deploys the Wavelength game server to your own Cloudflare account via Wrangler.
# Credentials are read from .env.local automatically.

$ErrorActionPreference = "Stop"

# Load .env.local from the project root (parent of scripts/)
$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectRoot ".env.local"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and !$line.StartsWith("#") -and $line.Contains("=")) {
            $parts = $line.Split("=", 2)
            $key   = $parts[0].Trim()
            $value = $parts[1].Trim()
            [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }
    Write-Host "✅ Loaded .env.local" -ForegroundColor Green
} else {
    Write-Error ".env.local not found. Please create it with CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN."
    exit 1
}

# Verify required vars
if (-not $env:CLOUDFLARE_ACCOUNT_ID -or -not $env:CLOUDFLARE_API_TOKEN) {
    Write-Error "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set in .env.local"
    exit 1
}

Write-Host ""
Write-Host "🚀 Deploying Wavelength game server to Cloudflare Workers..." -ForegroundColor Cyan
Write-Host "   Account ID: $($env:CLOUDFLARE_ACCOUNT_ID.Substring(0, 8))..." -ForegroundColor Gray
Write-Host ""

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot
& "$projectRoot\node_modules\.bin\wrangler.cmd" deploy

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Deployed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "👉 Next steps:" -ForegroundColor Yellow
    Write-Host "   1. Copy the Worker URL printed above (e.g. wavelength-game.<account>.workers.dev)"
    Write-Host "   2. Set it as NEXT_PUBLIC_PARTYKIT_HOST in your Vercel project environment variables"
    Write-Host "      (without https:// prefix)"
    Write-Host "   3. Redeploy your Vercel frontend"
} else {
    Write-Host "❌ Deploy failed. See error above." -ForegroundColor Red
    exit 1
}
