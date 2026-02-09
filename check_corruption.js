const fs = require('fs');
const path = require('path');

const baseDir = 'e:\\Leonel C\\Documentos\\CoderHouse\\SuperLista-React_2026\\super-lista_react\\public\\data\\products';
const outputFile = 'e:\\Leonel C\\Documentos\\CoderHouse\\SuperLista-React_2026\\super-lista_react\\corruption_list.txt';

let corruptedFiles = [];

function scanDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      scanDir(fullPath);
    } else if (file.endsWith('.json')) {
      checkFile(fullPath);
    }
  }
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('<<<<<<<') || content.includes('=======') || content.includes('>>>>>>>')) {
    corruptedFiles.push(filePath);
  }
}

console.log('Starting scan...');
scanDir(baseDir);
fs.writeFileSync(outputFile, corruptedFiles.join('\n'));
console.log(`Scan complete. Found ${corruptedFiles.length} corrupted files.`);
