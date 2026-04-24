# Data Conversion & Upload Pipeline

## Prerequisites

- `tools/PotreeConverter` binary (download below)
- `rclone` configured for Cloudflare R2 (setup instructions below)

## Step 1 — Download PotreeConverter

```bash
curl -L https://github.com/potree/PotreeConverter/releases/download/2.1.1/PotreeConverter_2.1.1_x64_linux.zip -o PC.zip
unzip PC.zip
chmod +x PotreeConverter
rm PC.zip
```

## Step 2 — Convert LAS/LAZ to Potree format

```bash
./PotreeConverter /path/to/input.laz -o /tmp/output_name
```

This produces three files:
```
/tmp/output_name/
  metadata.json    # ~2KB; attribute list with min/max ranges
  octree.bin       # main octree data (1–5GB for large clouds)
  hierarchy.bin    # octree hierarchy (~KB)
```

Custom LAS extra attributes (e.g. M3C2 Distance, VegProbability) are preserved
verbatim and will appear in the viewer's Scalar Field dropdown automatically.

Typical conversion time: 5–20 minutes for 100M+ point clouds on SSD.

## Step 3 — Set up Cloudflare R2

1. Sign up at cloudflare.com (free)
2. Go to **R2** > Create bucket, e.g. `pointclouds`
3. Go to bucket **Settings** > enable **Public Access** (R2.dev subdomain)
4. Note your public URL: `https://pub-<hash>.r2.dev/`
5. Set CORS policy (Settings > CORS):

```json
[
  {
    "AllowedOrigins": ["https://<your-github-username>.github.io", "http://localhost:*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["Content-Length", "Content-Range"],
    "MaxAgeSeconds": 3600
  }
]
```

> **Important**: `Content-Range` must be in `ExposeHeaders` — Potree streams
> octree data using HTTP range requests.

## Step 4 — Configure rclone for R2

Install rclone: https://rclone.org/install/

Create R2 API token in Cloudflare dashboard (R2 > Manage API tokens > Create token).

```bash
rclone config
# Select: New remote
# Name: r2
# Type: s3
# Provider: Cloudflare
# Access key: <from Cloudflare API token>
# Secret key: <from Cloudflare API token>
# Endpoint: https://<account-id>.r2.cloudflarestorage.com
```

## Step 5 — Upload to R2

```bash
rclone copy /tmp/output_name r2:pointclouds/output_name/ --progress
```

## Step 6 — Build the viewer URL

```
https://<username>.github.io/view/?src=https://pub-<hash>.r2.dev/output_name/metadata.json&field=M3C2%20Distance&cmap=SPECTRAL&vmin=-1&vmax=1
```

To compare two clouds:
```
?src=<url1/metadata.json>&src2=<url2/metadata.json>&field=M3C2%20Distance&active=1
```

Click **Share** in the viewer to capture the current camera position too.

## Notes

- One 100M-point cloud ≈ 1–3 GB of octree data on disk
- Cloudflare R2 free tier: 10 GB storage, zero egress fees
- For local testing, add `http://localhost:8080` to R2 CORS AllowedOrigins
- If two clouds from the same survey don't align, check their coordinate offsets
  in `metadata.json` ("offset" key) — they should be identical for same-area surveys
