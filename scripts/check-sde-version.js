#!/usr/bin/env node

/**
 * Checks whether a new SDE build exists by comparing the remote build number
 * against the locally stored one in sde-version.txt.
 *
 * Exit codes:
 *   0 = new version available (prints new build number)
 *   1 = already up to date
 *   2 = error
 */

const fs = require('fs');
const path = require('path');

const LATEST_URL = 'https://developers.eveonline.com/static-data/tranquility/latest.jsonl';
const VERSION_FILE = path.join(__dirname, '..', 'sde-version.txt');

async function main() {
  // Read current local version
  let localBuild = 0;
  try {
    const content = fs.readFileSync(VERSION_FILE, 'utf-8').trim();
    localBuild = parseInt(content, 10) || 0;
  } catch {
    // File missing = first run
  }

  console.log(`Local SDE build: ${localBuild}`);

  // Fetch latest version from CCP
  let remoteBuild, releaseDate;
  try {
    const res = await fetch(LATEST_URL);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    const data = JSON.parse(await res.text());
    remoteBuild = data.buildNumber;
    releaseDate = data.releaseDate;
  } catch (err) {
    console.error(`Failed to fetch latest SDE version: ${err.message}`);
    process.exit(2);
  }

  console.log(`Remote SDE build: ${remoteBuild} (released ${releaseDate})`);

  if (remoteBuild > localBuild) {
    console.log(`New SDE version available: ${remoteBuild}`);
    // Write the new build number so downstream scripts can read it
    fs.writeFileSync(VERSION_FILE, String(remoteBuild) + '\n');
    process.exit(0);
  } else {
    console.log('SDE is up to date.');
    process.exit(1);
  }
}

main();
