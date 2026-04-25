#!/usr/bin/env node

/**
 * Downloads the SDE JSONL ZIP and extracts only the files we need
 * into the tmp/ directory. Streams the ZIP so we never store the
 * full 83MB on disk.
 *
 * Reads the build number from sde-version.txt (written by check-sde-version.js).
 *
 * Exit codes:
 *   0 = success
 *   1 = error
 */

const fs = require('fs');
const path = require('path');
const unzipper = require('unzipper');

const VERSION_FILE = path.join(__dirname, '..', 'sde-version.txt');
const TMP_DIR = path.join(__dirname, '..', 'tmp');

// Only extract these files from the ZIP
const NEEDED_FILES = new Set([
  'types.jsonl',
  'typeDogma.jsonl',
  'dogmaAttributes.jsonl',
]);

function getSdeUrl() {
  const build = fs.readFileSync(VERSION_FILE, 'utf-8').trim();
  if (!build || build === '0') {
    console.error('No SDE build number found. Run check-sde-version.js first.');
    process.exit(1);
  }
  console.log(`SDE build: ${build}`);
  return `https://developers.eveonline.com/static-data/tranquility/eve-online-static-data-${build}-jsonl.zip`;
}

// CCP often publishes latest.jsonl before the ZIP lands on the CDN. Retry 404s
// with exponential backoff (1, 2, 4, 8, 16 minutes) before giving up.
const RETRY_DELAYS_MS = [60_000, 120_000, 240_000, 480_000, 960_000];

async function fetchWithRetry(url) {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res;
    if (res.status !== 404 || attempt === RETRY_DELAYS_MS.length) {
      console.error(`Download failed: HTTP ${res.status} ${res.statusText}`);
      process.exit(1);
    }
    const wait = RETRY_DELAYS_MS[attempt];
    console.log(`  ZIP not on CDN yet (404). Retrying in ${wait / 60_000} min...`);
    await new Promise((r) => setTimeout(r, wait));
  }
}

async function main() {
  const url = getSdeUrl();
  console.log(`Downloading: ${url}`);

  // Create tmp directory
  fs.mkdirSync(TMP_DIR, { recursive: true });

  const res = await fetchWithRetry(url);

  const totalBytes = parseInt(res.headers.get('content-length') || '0', 10);
  if (totalBytes) {
    console.log(`ZIP size: ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
  }

  let extracted = 0;

  // Stream the ZIP and extract only the files we need
  await new Promise((resolve, reject) => {
    const { Readable } = require('stream');
    const nodeStream = Readable.fromWeb(res.body);

    nodeStream
      .pipe(unzipper.Parse())
      .on('entry', (entry) => {
        const fileName = path.basename(entry.path);
        if (NEEDED_FILES.has(fileName)) {
          const outPath = path.join(TMP_DIR, fileName);
          console.log(`  Extracting: ${fileName}`);
          entry.pipe(fs.createWriteStream(outPath)).on('finish', () => {
            extracted++;
          });
        } else {
          entry.autodrain();
        }
      })
      .on('close', resolve)
      .on('error', reject);
  });

  console.log(`Done. Extracted ${extracted}/${NEEDED_FILES.size} files to tmp/`);

  if (extracted < NEEDED_FILES.size) {
    console.error('Warning: not all expected files were found in the ZIP.');
    console.error('CCP may have changed the SDE structure.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
