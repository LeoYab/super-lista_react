
require('dotenv').config();
const unzipper = require('unzipper');
const csv = require('csv-parser');
const path = require('path');
const fs = require('fs');

const TEMP_ZIP = path.join(__dirname, '../src/data/temp_processing/temp_inspect.zip');
const OUT_FILE = path.join(__dirname, 'cencosud_keys.txt');

async function inspect() {
  const directory = await unzipper.Open.file(TEMP_ZIP);
  const targets = directory.files.filter(f => f.path.includes('comercio-sepa-9'));

  for (const file of targets) {
    if (!file.path.endsWith('.zip')) continue;
    const content = await file.buffer();
    const innerDir = await unzipper.Open.buffer(content);
    const sucursalFile = innerDir.files.find(f => f.path.toLowerCase().includes('sucursal') && f.path.endsWith('.csv'));

    if (sucursalFile) {
      const stream = sucursalFile.stream();
      stream.pipe(csv({ separator: '|' }))
        .on('data', (row) => {
          fs.writeFileSync(OUT_FILE, 'KEYS: ' + Object.keys(row).join(', '));
          process.exit(0);
        });
    }
  }
}
inspect();
