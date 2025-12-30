const fs = require('fs');
const path = require('path');

const SRC_SUPER_DIR = path.join(__dirname, '../src/data/super');
const SRC_PRODUCTS_DIR = path.join(__dirname, '../src/data/products');
const PUB_DATA_DIR = path.join(__dirname, '../public/data');
const PUB_SUPER_DIR = path.join(PUB_DATA_DIR, 'super');
const PUB_PRODUCTS_DIR = path.join(PUB_DATA_DIR, 'products');

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const copyRecursiveSync = (src, dest) => {
  const stats = fs.statSync(src);
  const isDirectory = stats.isDirectory();
  if (isDirectory) {
    ensureDir(dest);
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
};

const main = () => {
  console.log('Starting data organization...');
  ensureDir(PUB_DATA_DIR);
  ensureDir(PUB_SUPER_DIR);
  ensureDir(PUB_PRODUCTS_DIR);

  // 1. Aggregate branches
  if (fs.existsSync(SRC_SUPER_DIR)) {
    const files = fs.readdirSync(SRC_SUPER_DIR).filter(f => f.endsWith('.json'));
    const branchesByBrand = {};
    const brandNames = new Set();

    // Normalization map
    const BRAND_MAP = {
      'coto': 'Coto',
      'dia': 'Dia',
      'carrefour': 'Carrefour',
      'jumbo': 'Jumbo',
      'vea': 'Vea',
      'changomas': 'ChangoMas',
      'vital': 'Vital',
      'easy': 'Easy'
    };

    console.log(`Found ${files.length} branch files in src/data/super`);

    files.forEach(file => {
      try {
        const content = fs.readFileSync(path.join(SRC_SUPER_DIR, file), 'utf8');
        // Some files might be array wrapped, some might be single objects
        let data = JSON.parse(content);
        if (Array.isArray(data)) data = data[0];

        if (data && data.marca) {
          let brandKey = data.marca.toLowerCase().replace(/[^a-z0-9]/g, '');

          // Use normalized name for display
          let displayBrand = Object.keys(BRAND_MAP).find(k => k.toLowerCase() === brandKey);
          displayBrand = displayBrand ? BRAND_MAP[displayBrand] : data.marca;

          if (!branchesByBrand[brandKey]) {
            branchesByBrand[brandKey] = [];
            brandNames.add(displayBrand);
          }

          // Ensure id_sucursal is string
          data.id_sucursal = String(data.id_sucursal);
          branchesByBrand[brandKey].push(data);
        }
      } catch (err) {
        console.error(`Error processing ${file}:`, err.message);
      }
    });

    // Write aggregated files
    Object.keys(branchesByBrand).forEach(brandKey => {
      const branches = branchesByBrand[brandKey];
      const outPath = path.join(PUB_SUPER_DIR, `${brandKey}.json`);
      fs.writeFileSync(outPath, JSON.stringify(branches, null, 2));
      console.log(`Wrote ${branches.length} branches to ${outPath}`);
    });

    // Write supermarkets_list.json
    // We want a list of brands: { id, nombre }
    const superList = Object.keys(branchesByBrand).map(brandKey => {
      // Find the nice name from the branches or map
      const sample = branchesByBrand[brandKey][0];
      return {
        id: brandKey,
        nombre: sample.marca || brandKey.charAt(0).toUpperCase() + brandKey.slice(1)
      };
    });

    // Ensure all requested brands are in the list if they had data

    fs.writeFileSync(
      path.join(PUB_DATA_DIR, 'supermarkets_list.json'),
      JSON.stringify(superList, null, 2)
    );
    console.log('Wrote public/data/supermarkets_list.json');

  } else {
    console.log('SRC_SUPER_DIR does not exist.');
  }

  // 2. Copy Products
  if (fs.existsSync(SRC_PRODUCTS_DIR)) {
    console.log('Copying products directory...');
    copyRecursiveSync(SRC_PRODUCTS_DIR, PUB_PRODUCTS_DIR);
    console.log('Products copied.');
  } else {
    console.log('SRC_PRODUCTS_DIR does not exist.');
  }
};

main();
