
const unzipper = require('unzipper');
const path = require('path');
const fs = require('fs');

const TEMP_ZIP = path.join(__dirname, '../src/data/temp_processing/temp_inspect.zip'); // Assuming it exists from previous run

async function listFiles() {
  console.log('Opening ' + TEMP_ZIP);
  if (!fs.existsSync(TEMP_ZIP)) { console.log('Zip not found'); return; }

  const directory = await unzipper.Open.file(TEMP_ZIP);
  const zips = directory.files.filter(f => f.path.endsWith('.zip'));
  zips.forEach(z => console.log(z.path));
}
listFiles();
