#!/usr/bin/env node

/**
 * Reads the extracted JSONL files from tmp/ and produces a compact
 * docs/data/wormholes.json for the frontend.
 *
 * Exit codes:
 *   0 = success
 *   1 = error
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
};

// Human-readable labels for target system classes
const SYSTEM_CLASS_LABELS = {
  '-1': 'Exit WH (unknown)',
  1: 'C1',
  2: 'C2',
  3: 'C3',
  4: 'C4',
  5: 'C5',
  6: 'C6',
  7: 'High-Sec',
  8: 'Low-Sec',
  9: 'Null-Sec',
  10: 'Jove/unknown',
  11: 'Jove/unknown',
  12: 'Thera',
  13: 'Shattered',
  14: 'Sentinel',
  15: 'Barbican',
  16: 'Vidette',
  17: 'Conflux',
  18: 'Redoubt',
  25: 'Pochven',
};

function readJsonl(filename) {
  const filepath = path.join(TMP_DIR, filename);
  const content = fs.readFileSync(filepath, 'utf-8');
  const entries = [];
  for (const line of content.split('\n')) {
    if (line.trim()) {
      entries.push(JSON.parse(line));
    }
  }
  return entries;
}

function main() {
  console.log('Reading extracted SDE data...');

  // 1. Load all types, filter to wormholes (groupID 988)
  const allTypes = readJsonl('types.jsonl');
  const whTypes = allTypes.filter((t) => t.groupID === WORMHOLE_GROUP_ID);
  console.log(`  Found ${whTypes.length} wormhole types out of ${allTypes.length} total types`);

  // 2. Load typeDogma, index by typeID
  const allDogma = readJsonl('typeDogma.jsonl');
  const dogmaByType = new Map();
  for (const d of allDogma) {
    dogmaByType.set(d._key, d.dogmaAttributes || []);
  }
  console.log(`  Loaded ${allDogma.length} typeDogma entries`);

  // 3. Build compact wormhole records
  const wormholes = [];

  for (const wh of whTypes) {
    const typeID = wh._key;
    const fullName = wh.name?.en || '';
    // Extract short name: "Wormhole R943" → "R943"
    const name = fullName.replace(/^Wormhole\s+/i, '');

    const attrs = dogmaByType.get(typeID) || [];
    const getAttr = (id) => {
      const a = attrs.find((x) => x.attributeID === id);
      return a ? a.value : null;
    };

    const targetClass = getAttr(ATTR.targetSystemClass);
    const maxStableTimeMin = getAttr(ATTR.maxStableTime);

    const record = {
      name,
      typeID,
      targetClass: targetClass != null ? targetClass : null,
      targetClassLabel: targetClass != null
        ? (SYSTEM_CLASS_LABELS[String(targetClass)] || `Class ${targetClass}`)
        : null,
      maxStableTime: maxStableTimeMin != null
        ? Math.round(maxStableTimeMin / 60 * 100) / 100  // convert to hours
        : null,
      maxStableMass: getAttr(ATTR.maxStableMass),
      maxJumpMass: getAttr(ATTR.maxJumpMass),
      massRegeneration: getAttr(ATTR.massRegeneration),
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
    },
    wormholes,
  };

  // 5. Write JSON
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));

  const sizeKB = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);
  console.log(`\nWrote ${OUT_FILE}`);
  console.log(`  ${wormholes.length} wormhole types, ${sizeKB} KB`);
}

main();
