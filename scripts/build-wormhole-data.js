#!/usr/bin/env node

/**
 * Reads the extracted JSONL files from tmp/ and produces a compact
 * docs/data/wormholes.json for the frontend.
 *
 * Includes schema validation to catch SDE format changes early.
 *
 * Exit codes:
 *   0 = success
 *   1 = error (schema change, missing data, etc.)
 */

const fs = require('fs');
const path = require('path');

const TMP_DIR = path.join(__dirname, '..', 'tmp');
const OUT_FILE = path.join(__dirname, '..', 'docs', 'data', 'wormholes.json');

const WORMHOLE_GROUP_ID = 988;

// Dogma attribute IDs for wormhole properties
const ATTR = {
  targetSystemClass: 1381,
  maxStableTime: 1382,     // minutes
  maxStableMass: 1383,     // kg
  massRegeneration: 1384,  // kg
  maxJumpMass: 1385,       // kg
  targetDistribution: 1457,
};

// Validation thresholds — if data falls outside these, something is wrong
const VALIDATION = {
  minWormholeTypes: 80,     // SDE has had ~100-130, alert if way below
  maxWormholeTypes: 300,    // alert if unexpectedly high
  requiredFields: ['_key', 'groupID', 'name'],  // fields every type must have
  requiredDogmaFields: ['_key', 'dogmaAttributes'],  // fields every dogma entry must have
};

const warnings = [];

function warn(msg) {
  warnings.push(msg);
  console.warn(`  WARNING: ${msg}`);
}

function readJsonl(filename) {
  const filepath = path.join(TMP_DIR, filename);
  if (!fs.existsSync(filepath)) {
    throw new Error(`Missing file: ${filepath} — SDE structure may have changed.`);
  }
  const content = fs.readFileSync(filepath, 'utf-8');
  const entries = [];
  for (const line of content.split('\n')) {
    if (line.trim()) {
      entries.push(JSON.parse(line));
    }
  }
  return entries;
}

function validateType(t) {
  for (const field of VALIDATION.requiredFields) {
    if (t[field] === undefined) {
      warn(`Type ${t._key || '?'} missing field '${field}' — SDE schema may have changed.`);
      return false;
    }
  }
  if (typeof t.name !== 'object' || !t.name.en) {
    warn(`Type ${t._key} has unexpected name format — expected { en: "..." }.`);
    return false;
  }
  return true;
}

function validateDogma(d) {
  for (const field of VALIDATION.requiredDogmaFields) {
    if (d[field] === undefined) {
      warn(`Dogma entry ${d._key || '?'} missing field '${field}'.`);
      return false;
    }
  }
  if (!Array.isArray(d.dogmaAttributes)) {
    warn(`Dogma entry ${d._key} has non-array dogmaAttributes.`);
    return false;
  }
  return true;
}

function main() {
  console.log('Reading extracted SDE data...');

  // 1. Load all types, filter to wormholes (groupID 988)
  const allTypes = readJsonl('types.jsonl');
  const whTypes = allTypes.filter((t) => t.groupID === WORMHOLE_GROUP_ID);
  console.log(`  Found ${whTypes.length} wormhole types out of ${allTypes.length} total types`);

  // Validate count
  if (whTypes.length < VALIDATION.minWormholeTypes) {
    warn(`Only ${whTypes.length} wormhole types found (expected ${VALIDATION.minWormholeTypes}+). groupID may have changed.`);
  }
  if (whTypes.length > VALIDATION.maxWormholeTypes) {
    warn(`Found ${whTypes.length} wormhole types (expected max ~${VALIDATION.maxWormholeTypes}). Check if groupID 988 still means wormholes.`);
  }

  // 2. Load typeDogma, index by typeID
  const allDogma = readJsonl('typeDogma.jsonl');
  const dogmaByType = new Map();
  for (const d of allDogma) {
    if (validateDogma(d)) {
      dogmaByType.set(d._key, d.dogmaAttributes || []);
    }
  }
  console.log(`  Loaded ${allDogma.length} typeDogma entries`);

  // Check how many wormholes have dogma data
  // K162 (the exit side of connections) normally has no dogma — allow up to 2 missing
  let missingDogma = 0;
  for (const wh of whTypes) {
    if (!dogmaByType.has(wh._key)) {
      missingDogma++;
      console.log(`  Note: ${wh.name?.en || wh._key} has no dogma attributes.`);
    }
  }
  if (missingDogma > 2) {
    warn(`${missingDogma} wormhole types have no dogma attributes (expected at most 2).`);
  }

  // 3. Build compact wormhole records
  const wormholes = [];

  for (const wh of whTypes) {
    if (!validateType(wh)) continue;

    const typeID = wh._key;
    const fullName = wh.name?.en || '';
    const name = fullName.replace(/^Wormhole\s+/i, '');

    const attrs = dogmaByType.get(typeID) || [];
    const getAttr = (id) => {
      const a = attrs.find((x) => x.attributeID === id);
      return a ? a.value : null;
    };

    const record = {
      name,
      typeID,
      targetSystemClass: getAttr(ATTR.targetSystemClass),
      maxStableTime: getAttr(ATTR.maxStableTime),           // minutes
      maxStableMass: getAttr(ATTR.maxStableMass),            // kg
      maxJumpMass: getAttr(ATTR.maxJumpMass),                // kg
      massRegeneration: getAttr(ATTR.massRegeneration),      // kg
      targetDistribution: getAttr(ATTR.targetDistribution),
    };

    wormholes.push(record);
  }

  // Sort alphabetically by name
  wormholes.sort((a, b) => a.name.localeCompare(b.name));

  // 4. Build output with metadata
  const buildNumber = fs.readFileSync(
    path.join(__dirname, '..', 'sde-version.txt'), 'utf-8'
  ).trim();

  const output = {
    meta: {
      sdeBuild: parseInt(buildNumber, 10),
      generatedAt: new Date().toISOString(),
      count: wormholes.length,
      warnings: warnings.length > 0 ? warnings : undefined,
    },
    wormholes,
  };

  // 5. Write JSON
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));

  const sizeKB = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);
  console.log(`\nWrote ${OUT_FILE}`);
  console.log(`  ${wormholes.length} wormhole types, ${sizeKB} KB`);

  if (warnings.length > 0) {
    console.log(`\n${warnings.length} WARNING(S) — possible SDE schema change:`);
    warnings.forEach((w) => console.log(`  - ${w}`));
    // Exit with error so the workflow flags it
    process.exit(1);
  }
}

main();
