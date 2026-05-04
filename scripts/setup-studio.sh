#!/usr/bin/env bash
# Setup script for the CTA Studio render pipeline.
#
# Installs (idempotent — safe to re-run):
#   * Headless Chromium dependencies (apt-get system packages)
#   * Puppeteer (downloads its own bundled Chromium for predictable version)
#   * 8 curated fonts (SIL Open Font License or Apache 2.0)
#
# Run on every machine that hosts the Flask backend so the /api/studio/render
# endpoint can spawn a headless browser.
#
# Usage:  bash scripts/setup-studio.sh
# Verify: node scripts/check-studio.js

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="${REPO_ROOT}/web"
FONTS_DIR="${REPO_ROOT}/studio-assets/fonts"
LOCAL_FONTS_DIR="${HOME}/.local/share/fonts/studio"

echo "==> Studio setup starting in ${REPO_ROOT}"

# ── Step 1: Chromium runtime dependencies ──────────────────────────────────
# Puppeteer's bundled Chromium is a binary — it needs these shared libraries
# to launch headlessly. List comes from Puppeteer's troubleshooting docs.
need_pkgs=(
    ca-certificates
    fonts-liberation
    libasound2
    libatk-bridge2.0-0
    libatk1.0-0
    libc6
    libcairo2
    libcups2
    libdbus-1-3
    libexpat1
    libfontconfig1
    libgbm1
    libgcc1
    libglib2.0-0
    libgtk-3-0
    libnspr4
    libnss3
    libpango-1.0-0
    libpangocairo-1.0-0
    libstdc++6
    libx11-6
    libx11-xcb1
    libxcb1
    libxcomposite1
    libxcursor1
    libxdamage1
    libxext6
    libxfixes3
    libxi6
    libxrandr2
    libxrender1
    libxss1
    libxtst6
    lsb-release
    wget
    xdg-utils
    fontconfig
)

if command -v apt-get >/dev/null 2>&1; then
    echo "==> Step 1/3: installing Chromium runtime deps (apt)"
    sudo apt-get update -qq
    sudo apt-get install -y --no-install-recommends "${need_pkgs[@]}"
else
    echo "WARN: apt-get not found — install equivalents for your distro:"
    printf '  %s\n' "${need_pkgs[@]}"
fi

# ── Step 2: Puppeteer in the existing web/ workspace ───────────────────────
echo "==> Step 2/3: installing Puppeteer in ${WEB_DIR}"
cd "${WEB_DIR}"
if [ ! -f package.json ]; then
    echo "ERROR: ${WEB_DIR}/package.json missing — run from repo root."
    exit 1
fi

# Pin the Chromium cache dir to the repo so Puppeteer's runtime + the
# install step both use the same path (regardless of CWD). Drop a
# .puppeteerrc.cjs into web/ — Puppeteer reads it automatically.
PUP_CACHE="${REPO_ROOT}/.puppeteer-cache"
mkdir -p "${PUP_CACHE}"
cat > "${WEB_DIR}/.puppeteerrc.cjs" <<EOF
module.exports = {
  cacheDirectory: "${PUP_CACHE}",
};
EOF

export PUPPETEER_CACHE_DIR="${PUP_CACHE}"
npm install --save puppeteer@^23

# Puppeteer 22+ no longer downloads Chrome during \`npm install\` — the
# browser binary needs an explicit install step. Idempotent: skips if
# already present in the cache dir.
echo "    fetching headless Chrome (this can take a minute)"
npx --yes puppeteer browsers install chrome

# ── Step 3: Curated fonts ──────────────────────────────────────────────────
# Eight font families licensed for embedding (SIL OFL or Apache 2.0). The
# Studio's render template references them by family name; the headless
# browser picks them up via fontconfig.
mkdir -p "${FONTS_DIR}" "${LOCAL_FONTS_DIR}"

declare -A FONT_URLS=(
    [bold_display]="https://github.com/google/fonts/raw/main/ofl/bebasneue/BebasNeue-Regular.ttf"
    [clean_sans]="https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Regular.woff2"
    [clean_sans_bold]="https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Bold.woff2"
    [serif]="https://github.com/google/fonts/raw/main/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf"
    [handwritten]="https://github.com/google/fonts/raw/main/ofl/caveat/Caveat%5Bwght%5D.ttf"
    [mono]="https://github.com/JetBrains/JetBrainsMono/raw/master/fonts/ttf/JetBrainsMono-Regular.ttf"
    [condensed]="https://github.com/google/fonts/raw/main/ofl/oswald/Oswald%5Bwght%5D.ttf"
    [slab]="https://github.com/google/fonts/raw/main/apache/robotoslab/RobotoSlab%5Bwght%5D.ttf"
    [rounded]="https://github.com/google/fonts/raw/main/ofl/nunito/Nunito%5Bwght%5D.ttf"
)

echo "==> Step 3/3: installing 8 curated fonts to ${LOCAL_FONTS_DIR}"
for name in "${!FONT_URLS[@]}"; do
    url="${FONT_URLS[$name]}"
    ext="${url##*.}"
    out="${FONTS_DIR}/${name}.${ext}"
    if [ ! -f "${out}" ]; then
        echo "    fetching ${name}"
        curl -sSfL "${url}" -o "${out}" || {
            echo "    WARN: ${name} download failed — Studio will fall back to Inter."
            continue
        }
    fi
    cp -f "${out}" "${LOCAL_FONTS_DIR}/${name}.${ext}"
done
fc-cache -f "${LOCAL_FONTS_DIR}" >/dev/null 2>&1 || true

echo
echo "==> Studio setup complete."
echo "    Verify with: node ${REPO_ROOT}/scripts/check-studio.js"
echo "    Fonts cache: ${FONTS_DIR}"
echo "    Puppeteer:   ${PUPPETEER_CACHE_DIR}"
