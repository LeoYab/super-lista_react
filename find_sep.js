const fs = require('fs');
const content = fs.readFileSync('e:\\Leonel C\\Documentos\\CoderHouse\\SuperLista-React_2026\\super-lista_react\\public\\data\\products\\dia\\87.json', 'utf8');
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].startsWith('=======') || lines[i].includes('=======')) {
    console.log(`Found ======= at line ${i + 1}`);
  }
}
