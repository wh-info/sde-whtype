#!/usr/bin/env node

/**
 * Checks whether a new SDE build exists and whether it includes
 * wormhole-relevant changes.
 *
 * Flow:
 *   1. Fetch latest.jsonl to get the current remote build number
 *   2. Compare to local sde-version.txt
 *   3. If new build exists, fetch the changes file for that build
 *   4. Check if any changed typeIDs in 'types' or 'typeDogma' are
 *      wormhole types (groupID 988), or if 'dogmaAttributes' changed
 *   5. If wormhole data is affected (or we can't tell), proceed with update
 *
 * Exit codes:
 *   0 = new version with wormhole-relevant changes (or first run)
 *   1 = no update needed (already up to date, or no wormhole changes)
 *   2 = error
 */

const fs = require('fs');
const path = require('path');

const LATEST_URL = 'https://developers.eveonline.com/static-data/tranquility/latest.jsonl';
const CHANGES_URL = 'https://developers.eveonline.com/static-data/tranquility/changes/';
const VERSION_FILE = path.join(__dirname, '..', 'sde-version.txt');
const WORMHOLES_FILE = path.join(__dirname, '..', 'docs', 'data', 'wormholes.json');

// Collections we care about
const RELEVANT_COLLECTIONS = ['types', 'typeDogma', 'dogmaAttributes'];

function loadWormholeTypeIDs() {
  try {
    const data = JSON.parse(fs.readFileSync(WORMHOLES_FILE, 'utf-8'));
    return new Set(data.wormholes.map((w) => w.typeID));
  } catch {
    // No wormholes.json yet = first run, must download
    return null;
  }
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.text();
}

async function checkChangesForWormholes(buildNumber, whTypeIDs) {
  // If we don't have a wormhole ID list, we can't filter — must download
  if (!whTypeIDs) {
    console.log('No existing wormhole data — must download full SDE.');
    return true;
  }

  console.log(`Checking changes file for build ${buildNumber}...`);

  let changesText;
  try {
    changesText = await fetchJson(`${CHANGES_URL}${buildNumber}.jsonl`);
  } catch (err) {
    console.log(`Could not fetch changes file: ${err.message}`);
    console.log('Cannot determine if wormhole data changed — will download to be safe.');
    return true;
  }

  const changes = {};
  for (const line of changesText.split('\n')) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line);
    if (entry._key !== '_meta') {
      changes[entry._key] = entry;
    }
  }

  // Check if dogmaAttributes changed at all (affects attribute definitions)
  if (changes.dogmaAttributes) {
    console.log('  dogmaAttributes changed — wormhole attribute definitions may be affected.');
    return true;
  }

  // Check if any changed/added typeIDs in 'types' or 'typeDogma' are wormhole types
  for (const collection of ['types', 'typeDogma']) {
    const entry = changes[collection];
    if (!entry) continue;

    const allIDs = [
      ...(entry.added || []),
      ...(entry.changed || []),
      ...(entry.removed || []),
    ];

    for (const id of allIDs) {
      if (whTypeIDs.has(id)) {
        console.log(`  ${collection} has changes to wormhole typeID ${id}.`);
        return true;
      }
    }

    // New types added that we don't know about yet could be new wormholes
    if (entry.added && entry.added.length > 0) {
      console.log(`  ${collection} has ${entry.added.length} new entries — could include new wormhole types.`);
      return true;
    }
  }

  console.log('  No wormhole-relevant changes detected in this build.');
  return false;
}

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
    const data = JSON.parse(await fetchJson(LATEST_URL));
    remoteBuild = data.buildNumber;
    releaseDate = data.releaseDate;
  } catch (err) {
    console.error(`Failed to fetch latest SDE version: ${err.message}`);
    process.exit(2);
  }

  console.log(`Remote SDE build: ${remoteBuild} (released ${releaseDate})`);

  if (remoteBuild <= localBuild) {
    console.log('SDE is up to date.');
    process.exit(1);
  }

  console.log(`New SDE version available: ${remoteBuild}`);

  // Check changes file to see if wormhole data was affected
  const whTypeIDs = loadWormholeTypeIDs();
  const hasWormholeChanges = await checkChangesForWormholes(remoteBuild, whTypeIDs);

  if (hasWormholeChanges) {
    console.log('Wormhole-relevant changes detected — proceeding with update.');
    fs.writeFileSync(VERSION_FILE, String(remoteBuild) + '\n');
    process.exit(0);
  } else {
    // Update version file so we don't re-check this build, but skip download
    console.log('Updating version tracker to skip this build in future checks.');
    fs.writeFileSync(VERSION_FILE, String(remoteBuild) + '\n');
    process.exit(1);
  }
}

main();
