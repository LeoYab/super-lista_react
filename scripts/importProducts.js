require('dotenv').config();
const unzipper = require('unzipper');
const csv = require('csv-parser');
const fetch = require('node-fetch');
const stream = require('stream');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const admin = require('firebase-admin');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

if (!serviceAccountPath) {
  console.error('Error: La variable de entorno FIREBASE_SERVICE_ACCOUNT_KEY no está definida.');
  console.error('Para uso local, configúrala en tu archivo .env (ej: FIREBASE_SERVICE_ACCOUNT_KEY=\'./serviceAccountKey.json\').');
  console.error('Para GitHub Actions, asegúrate de que el workflow la pase como variable de entorno.');
  process.exit(1);
}

let serviceAccount;
try {
  // Carga el archivo JSON desde la ruta proporcionada
  // path.resolve() es importante para manejar rutas relativas correctamente
  serviceAccount = require(path.resolve(process.cwd(), serviceAccountPath));
  console.log(`Credenciales de Firebase cargadas desde el archivo: ${serviceAccountPath}`);
} catch (error) {
  console.error(`Error al cargar el archivo de cuenta de servicio de Firebase desde ${serviceAccountPath}:`, error);
  console.error(`Asegúrate de que la ruta en FIREBASE_SERVICE_ACCOUNT_KEY es correcta y el archivo existe.`);
  process.exit(1);
}

// Inicializa Firebase Admin SDK con las credenciales cargadas
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = getFirestore();
const pipeline = promisify(stream.pipeline);

const DAILY_URLS = {
  0: 'https://datos.produccion.gob.ar/dataset/6f47ec76-d1ce-4e34-a7e1-621fe9b1d0b5/resource/f8e75128-515a-436e-bf8d-5c63a62f2005/download/sepa_domingo.zip',
  1: 'https://datos.produccion.gob.ar/dataset/6f47ec76-d1ce-4e34-a7e1-621fe9b1d0b5/resource/0a9069a9-06e8-4f98-874d-da5578693290/download/sepa_lunes.zip',
  2: 'https://datos.produccion.gob.ar/dataset/6f47ec76-d1ce-4e34-a7e1-621fe9b1d0b5/resource/9dc06241-cc83-44f4-8e25-c9b1636b8bc8/download/sepa_martes.zip',
  3: 'https://datos.produccion.gob.ar/dataset/6f47ec76-d1ce-4e34-a7e1-621fe9b1d0b5/resource/1e92cd42-4f94-4071-a165-62c4cb2ce23c/download/sepa_miercoles.zip',
  4: 'https://datos.produccion.gob.ar/dataset/6f47ec76-d1ce-4e34-a7e1-621fe9b1d0b5/resource/d076720f-a7f0-4af8-b1d6-1b99d5a90c14/download/sepa_jueves.zip',
  5: 'https://datos.produccion.gob.ar/dataset/6f47ec76-d1ce-4e34-a7e1-621fe9b1d0b5/resource/91bc072a-4726-44a1-85ec-4a8467aad27e/download/sepa_viernes.zip',
  6: 'https://datos.produccion.gob.ar/dataset/6f47ec76-d1ce-4e34-a7e1-621fe9b1d0b5/resource/b3c3da5d-213d-41e7-8d74-f23fda0a3c30/download/sepa_sabado.zip',
};

const TEMP_DATA_DIR = path.join(__dirname, '../src/data/temp_processing');
const tempZipPath = path.join(TEMP_DATA_DIR, 'temp_sepa.zip');
const BASE_SUPER_DIR = path.join(__dirname, '../src/data/super');
const BASE_PRODUCTS_DIR = path.join(__dirname, '../src/data/products');

const KNOWN_ZIPS_TO_PROCESS_PREFIXES = new Set([
  'sepa_1_comercio-sepa-10',
  'sepa_1_comercio-sepa-11',
  'sepa_1_comercio-sepa-15'
]);

const TARGET_SUPERMARKETS_LOCATIONS = [
  { name: 'Hipermercado Carrefour San Isidro', lat: -34.491345, lon: -58.589025, brand: 'Carrefour', id_sucursal: '1' },
  { name: 'DIA Jose Leon Suarez', lat: -34.532479, lon: -58.575497, brand: 'Dia', id_sucursal: '87' },
  { name: 'HiperChangomas San Fernando', lat: -34.484169, lon: -58.595829, brand: 'ChangoMas', id_sucursal: '1004' }
];

const TARGET_COMERCIO_IDENTIFIERS = {
  'Carrefour': {
    razon_social_keywords: ['inc s.a.', 'carrefour'],
    cuits: ['30687310434']
  },
  'Dia': {
    razon_social_keywords: ['dia argentina s.a.'],
    cuits: ['30685849751']
  },
  'ChangoMas': {
    razon_social_keywords: ['dorinka srl', 'changomas', 'walmart'],
    cuits: ['30678138300']
  }
};

const DISTANCE_THRESHOLD = 0.005;

const MARCAS_NORMALIZADAS_INTERES = new Set([
  'Dia',
  'Carrefour',
  'ChangoMas'
]);

async function downloadZipForDay(url, outputPath) {
  console.log(`Descargando ZIP para el día desde: ${url}`);
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Error al descargar el archivo ZIP: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await fsp.writeFile(outputPath, buffer);
    console.log(`ZIP del día descargado en ${outputPath}.`);
    return buffer;
  } catch (error) {
    console.error(`ERROR al descargar el ZIP de ${url}:`, error);
    throw error;
  }
}

async function writeToJson(data, filename) {
  if (!data || (Array.isArray(data) && data.length === 0)) {
    console.log(`No hay datos para escribir en ${filename}. El archivo estará vacío o no se creará.`);
    const dir = path.dirname(filename);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(filename, JSON.stringify([], null, 2), 'utf8');
    return;
  }
  try {
    await fsp.writeFile(filename, JSON.stringify(data, null, 2), 'utf8');
    console.log(`Datos guardados en ${filename}`);
  } catch (err) {
    console.error(`Error al escribir en ${filename}:`, err);
    throw err;
  }
}

function getDistance(lat1, lon1, lat2, lon2) {
  const dx = lon1 - lon2;
  const dy = lat1 - lat2;
  return Math.sqrt(dx * dx + dy * dy);
}

async function procesarCsvStream(streamCsv, filenameForLog = 'CSV desconocido') {
  return new Promise((resolve, reject) => {
    const docs = [];
    let buffer = '';
    let delimiterDetected = false;
    let parser;
    const readBufferLimit = 1024 * 5;
    const passthrough = new stream.PassThrough();

    const commonColumnMaps = {
      'id_comercio': ['id_comercio', 'id'],
      'id_sucursal': ['id_sucursal', '0', '1', '2', 'sucursal_id'],
      'comercio_cuit': ['comercio_cuit', 'cuit'],
      'comercio_razon_social': ['comercio_razon_social', 'razon_social', 'razon social'],
      'sucursales_latitud': ['sucursales_latitud', 'latitud'],
      'sucursales_longitud': ['sucursales_longitud', 'longitud'],
      'productos_descripcion': ['productos_descripcion', 'descripcion', 'producto_nombre'],
      'productos_precio_lista': ['productos_precio_lista', 'precio_lista', 'precio'],
      'productos_ean': ['productos_ean', 'ean'],
      'productos_marca': ['productos_marca', 'marca_producto', 'marca'],
      'productos_cantidad_presentacion': ['productos_cantidad_presentacion', 'cantidad_presentacion'],
      'productos_unidad_medida_presentacion': ['productos_unidad_medida_presentacion', 'unidad_medida_presentacion'],
      'sucursal_nombre': ['sucursal_nombre', 'nombre'],
      'sucursal_direccion': ['sucursal_direccion', 'direccion'],
      'sucursales_provincia': ['sucursales_provincia', 'provincia'],
      'sucursales_localidad': ['sucursales_localidad', 'localidad']
    };

    streamCsv
      .on('data', chunk => {
        if (!delimiterDetected) {
          buffer += chunk.toString();
          if (buffer.length < readBufferLimit && !buffer.includes('\n')) {
            return;
          }

          const firstLine = buffer.split('\n')[0];
          let detectedDelimiter = ',';
          let maxMatches = -1;
          const potentialDelimiters = [',', ';', '|', '\t'];
          const lowerCaseFirstLine = firstLine.toLowerCase();

          for (const delim of potentialDelimiters) {
            const headers = lowerCaseFirstLine.split(delim).map(h => h.trim());
            let currentMatches = 0;
            for (const key in commonColumnMaps) {
              if (commonColumnMaps[key].some(colName => headers.includes(colName))) {
                currentMatches++;
              }
            }
            if (headers.length > 1 && currentMatches > maxMatches) {
              maxMatches = currentMatches;
              detectedDelimiter = delim;
            }
          }

          if (maxMatches <= 0 && firstLine.length > 0) {
            if (firstLine.includes('|')) detectedDelimiter = '|';
            else if (firstLine.includes(';')) detectedDelimiter = ';';
            else if (firstLine.includes('\t')) detectedDelimiter = '\t';
            else detectedDelimiter = ',';
            console.warn(`[WARN] Delimitador inferido para ${filenameForLog} como '${detectedDelimiter}'.`);
          } else if (firstLine.length === 0) {
            detectedDelimiter = ',';
          }

          console.log(`[CSV] Delimitador detectado para ${filenameForLog}: '${detectedDelimiter}' (coincidencias de encabezados: ${maxMatches})`);

          parser = csv({
            separator: detectedDelimiter,
            strict: false,
            mapHeaders: ({ header, index }) => {
              const normalizedHeader = header.toLowerCase().trim();
              for (const key in commonColumnMaps) {
                if (commonColumnMaps[key].includes(normalizedHeader)) {
                  return key;
                }
              }
              return normalizedHeader || `col_${index}`;
            },
            mapValues: ({ header, index, value }) => value.trim()
          });

          parser.on('data', (data) => docs.push(data))
            .on('end', () => resolve(docs))
            .on('error', reject);

          passthrough.pipe(parser);
          passthrough.write(buffer);
          buffer = '';
          delimiterDetected = true;
        } else {
          passthrough.write(chunk);
        }
      })
      .on('end', () => {
        if (!delimiterDetected) {
          if (buffer.length > 0) {
              console.warn(`[WARN] Archivo ${filenameForLog} es muy pequeño. Procesando con delimitador '${detectedDelimiter}'.`);
              parser = csv({
                separator: detectedDelimiter,
                strict: false,
                mapHeaders: ({ header, index }) => {
                  const normalizedHeader = header.toLowerCase().trim();
                  for (const key in commonColumnMaps) {
                    if (commonColumnMaps[key].includes(normalizedHeader)) {
                      return key;
                    }
                  }
                  return normalizedHeader || `col_${index}`;
                },
                mapValues: ({ header, index, value }) => value.trim()
              });
              passthrough.pipe(parser);
              passthrough.write(buffer);
          }
          passthrough.end();
          resolve(docs);
        } else {
          passthrough.end();
        }
      })
      .on('error', reject);
  });
}

function findMatchingBranch(branch, targetLocations) {
  for (const target of targetLocations) {
    if (String(branch.id_sucursal) === String(target.id_sucursal)) {
        return target;
    }

    if (parseFloat(branch.sucursales_latitud) && parseFloat(branch.sucursales_longitud) &&
        getDistance(parseFloat(branch.sucursales_latitud), parseFloat(branch.sucursales_longitud), target.lat, target.lon) < DISTANCE_THRESHOLD) {
      const normalizedBranchName = (branch.sucursal_nombre || '').toLowerCase();
      const normalizedTargetName = (target.name || '').toLowerCase();

      if (normalizedBranchName.includes(normalizedTargetName.split(' ')[0].toLowerCase()) ||
          normalizedTargetName.includes(normalizedBranchName.split(' ')[0].toLowerCase())) {
        return target;
      }
      return target;
    }
  }
  return null;
}

function normalizeProductData(product, brand, branchId) {
  if (!product.productos_descripcion || !product.productos_precio_lista || !product.productos_ean) {
    return null;
  }

  const sanitizedEan = String(product.productos_ean).replace(/\D/g, '');
  if (!sanitizedEan) return null;

  const productId = `${sanitizedEan}_${brand.replace(/[^a-z0-9]/gi, '').toLowerCase()}_${branchId}`;

  let precio = parseFloat(String(product.productos_precio_lista).replace(',', '.'));
  if (isNaN(precio)) precio = 0;

  return {
    id: productId,
    ean: sanitizedEan,
    nombre: product.productos_descripcion,
    marca_producto: product.productos_marca || 'Sin Marca',
    precio: precio,
    cantidad_presentacion: product.productos_cantidad_presentacion || '1',
    unidad_medida_presentacion: product.productos_unidad_medida_presentacion || 'unidad',
    supermercado_marca: brand,
    sucursal_id: branchId,
    stock: true,
    ultima_actualizacion: Timestamp.now()
  };
}

function normalizeBranchData(branch, brand, matchedTarget) {
  return {
    id_sucursal: matchedTarget.id_sucursal,
    comercio_id: String(branch.id_comercio || ''),
    comercio_cuit: String(branch.comercio_cuit || ''),
    comercio_razon_social: branch.comercio_razon_social || '',
    nombre_sucursal: branch.sucursal_nombre || '',
    direccion_sucursal: branch.sucursal_direccion || '',
    provincia: branch.sucursales_provincia || '',
    localidad: branch.sucursales_localidad || '',
    latitud: parseFloat(branch.sucursales_latitud) || 0,
    longitud: parseFloat(branch.sucursales_longitud) || 0,
    marca: brand,
    ultima_actualizacion: Timestamp.now()
  };
}

async function procesarZipInterno(bufferZipInterno, allFilteredSucursalesByBrand, allProductsByBranch, zipFileName) {
  const innerDirectory = await unzipper.Open.buffer(bufferZipInterno);

  for (const innerFile of innerDirectory.files) {
    if (innerFile.path.toLowerCase().endsWith('.csv')) {
      console.log(`     Procesando CSV: ${innerFile.path}`);
      const csvStream = innerFile.stream();
      let docs;
      try {
        docs = await procesarCsvStream(csvStream, innerFile.path);
      } catch (csvError) {
        console.error(`    [ERROR] Falló el procesamiento de CSV ${innerFile.path}:`, csvError.message);
        continue;
      }

      if (docs.length === 0) {
        console.warn(`    [WARN] El archivo CSV ${innerFile.path} está vacío o no contiene datos válidos.`);
        continue;
      }

      const firstDoc = docs[0];
      const isProductFile = firstDoc.hasOwnProperty('productos_ean') || firstDoc.hasOwnProperty('productos_descripcion');
      const isBranchFile = firstDoc.hasOwnProperty('id_sucursal') && firstDoc.hasOwnProperty('sucursales_latitud');

      if (isBranchFile) {
        for (const doc of docs) {
          let foundBrand = null;
          for (const brand in TARGET_COMERCIO_IDENTIFIERS) {
            const keywords = TARGET_COMERCIO_IDENTIFIERS[brand].razon_social_keywords;
            const cuits = TARGET_COMERCIO_IDENTIFIERS[brand].cuits;
            if (keywords.some(kw => (doc.comercio_razon_social || '').toLowerCase().includes(kw.toLowerCase())) ||
                cuits.includes(String(doc.comercio_cuit))) {
              foundBrand = brand;
              break;
            }
          }

          if (foundBrand) {
            const matchedTargetBranch = findMatchingBranch(doc, TARGET_SUPERMARKETS_LOCATIONS.filter(t => t.brand === foundBrand));
            if (matchedTargetBranch) {
              const normalizedSucursal = normalizeBranchData(doc, foundBrand, matchedTargetBranch);
              if (!allFilteredSucursalesByBrand.has(foundBrand)) {
                allFilteredSucursalesByBrand.set(foundBrand, new Map());
              }
              allFilteredSucursalesByBrand.get(foundBrand).set(matchedTargetBranch.id_sucursal, normalizedSucursal);
            }
          }
        }
      } else if (isProductFile) {
        for (const doc of docs) {
          const docSucursalId = String(doc.id_sucursal);

          let matchingTargetSucursal = null;
          let targetBrand = null;

          for (const target of TARGET_SUPERMARKETS_LOCATIONS) {
            if (String(target.id_sucursal) === docSucursalId) {
              matchingTargetSucursal = target;
              targetBrand = target.brand;
              break;
            }
          }

          if (matchingTargetSucursal && MARCAS_NORMALIZADAS_INTERES.has(targetBrand)) {
            const normalizedProduct = normalizeProductData(doc, targetBrand, matchingTargetSucursal.id_sucursal);
            if (normalizedProduct) {
              if (!allProductsByBranch.has(targetBrand)) {
                allProductsByBranch.set(targetBrand, new Map());
              }
              if (!allProductsByBranch.get(targetBrand).has(matchingTargetSucursal.id_sucursal)) {
                allProductsByBranch.get(targetBrand).set(matchingTargetSucursal.id_sucursal, []);
              }
              allProductsByBranch.get(targetBrand).get(matchingTargetSucursal.id_sucursal).push(normalizedProduct);
            }
          }
        }
      } else {
        console.warn(`    [WARN] CSV ${innerFile.path} no reconocido como archivo de sucursales o productos por sus encabezados.`);
      }
    }
  }
}

async function loadLocalJsonData(basePath, isProduct = false) {
  const dataMap = new Map();

  if (!fs.existsSync(basePath)) {
    console.log(`No se encontró el directorio local: ${basePath}. Se asumirá que no hay datos locales existentes.`);
    return isProduct ? new Map() : new Map();
  }

  const brandDirs = await fsp.readdir(basePath, { withFileTypes: true });

  if (isProduct) {
    for (const brandDirEntry of brandDirs) {
      if (brandDirEntry.isDirectory()) {
        const brandName = brandDirEntry.name;
        if (!MARCAS_NORMALIZADAS_INTERES.has(brandName)) {
            continue;
        }
        const brandPath = path.join(basePath, brandName);
        const branchFiles = await fsp.readdir(brandPath, { withFileTypes: true });
        const productsByBranch = new Map();

        for (const branchFileEntry of branchFiles) {
          if (branchFileEntry.isFile() && branchFileEntry.name.endsWith('.json')) {
            const branchId = branchFileEntry.name.split('.')[0];
            try {
              const productsList = JSON.parse(await fsp.readFile(path.join(brandPath, branchFileEntry.name), 'utf8'));
              const productsInBranchMap = new Map();
              productsList.forEach(p => productsInBranchMap.set(p.id, p));
              productsByBranch.set(branchId, productsInBranchMap);
            } catch (error) {
              console.warn(`[WARN] Error al leer productos de ${path.join(brandPath, branchFileEntry.name)}:`, error.message);
            }
          }
        }
        dataMap.set(brandName, productsByBranch);
      }
    }
  } else {
    for (const fileEntry of brandDirs) {
      if (fileEntry.isFile() && fileEntry.name.endsWith('.json')) {
        const brandNameFromFile = fileEntry.name.split('.')[0];
        if (!MARCAS_NORMALIZADAS_INTERES.has(brandNameFromFile)) {
            continue;
        }
        try {
          const sucursalesList = JSON.parse(await fsp.readFile(path.join(basePath, fileEntry.name), 'utf8'));
          sucursalesList.forEach(s => dataMap.set(s.id_sucursal, s));
        } catch (error) {
          console.warn(`[WARN] Error al leer sucursales de ${path.join(basePath, fileEntry.name)}:`, error.message);
        }
      }
    }
  }
  return dataMap;
}

async function cleanTempJsons() {
    console.log(`[LIMPIEZA] Intentando eliminar el directorio temporal: ${TEMP_DATA_DIR}`);
    try {
        await fsp.rm(TEMP_DATA_DIR, { recursive: true, force: true });
        console.log(`[LIMPIEZA] Directorio temporal '${TEMP_DATA_DIR}' y su contenido eliminados exitosamente.`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`[LIMPIEZA] Directorio temporal '${TEMP_DATA_DIR}' no existía, no es necesario eliminar.`);
        } else {
            console.error(`[LIMPIEZA] ERROR crítico al limpiar el directorio temporal '${TEMP_DATA_DIR}':`, error);
        }
    }
}

async function compareDataAndPrepareFirestoreChanges(
  newSucursalesByBrand, newProductsByBranch,
  existingLocalSucursales, existingLocalProducts
) {
  const currentTimestamp = Timestamp.now();

  const sucursalesToAdd = [];
  const sucursalesToUpdate = [];

  for (const [brandName, sucursalesMap] of newSucursalesByBrand.entries()) {
    if (!MARCAS_NORMALIZADAS_INTERES.has(brandName)) {
        continue;
    }
    for (const [id, newSucursalData] of sucursalesMap.entries()) {
      const existingSucursalData = existingLocalSucursales.get(id);

      newSucursalData.ultima_actualizacion = currentTimestamp;

      if (!existingSucursalData) {
        sucursalesToAdd.push(newSucursalData);
      } else {
        const isModified = existingSucursalData.nombre_sucursal !== newSucursalData.nombre_sucursal ||
          existingSucursalData.direccion_sucursal !== newSucursalData.direccion_sucursal ||
          existingSucursalData.latitud !== newSucursalData.latitud ||
          existingSucursalData.longitud !== newSucursalData.longitud ||
          existingSucursalData.comercio_razon_social !== newSucursalData.comercio_razon_social ||
          existingSucursalData.provincia !== newSucursalData.provincia ||
          existingSucursalData.localidad !== newSucursalData.localidad;

        if (isModified) {
          sucursalesToUpdate.push(newSucursalData);
        }
      }
    }
  }

  const productsToAdd = [];
  const productsToUpdate = [];
  const productsToDeactivate = [];

  for (const [brandName, newBranchesMap] of newProductsByBranch.entries()) {
    if (!MARCAS_NORMALIZADAS_INTERES.has(brandName)) {
        continue;
    }

    const existingBrandProductsMap = existingLocalProducts.get(brandName) || new Map();

    for (const [branchId, newProductsList] of newBranchesMap.entries()) {
      const existingBranchProductsMap = existingBrandProductsMap.get(branchId) || new Map();
      const newProductsInBranchMap = new Map();
      newProductsList.forEach(p => newProductsInBranchMap.set(p.id, p));

      for (const [id, newProductData] of newProductsInBranchMap.entries()) {
        const existingProductData = existingBranchProductsMap.get(id);
        newProductData.ultima_actualizacion = currentTimestamp;

        if (!existingProductData) {
          productsToAdd.push(newProductData);
        } else {
          const isModified = existingProductData.precio !== newProductData.precio ||
            existingProductData.stock !== newProductData.stock ||
            existingProductData.nombre !== newProductData.nombre ||
            existingProductData.ean !== newProductData.ean ||
            existingProductData.marca_producto !== newProductData.marca_producto ||
            existingProductData.cantidad_presentacion !== newProductData.cantidad_presentacion ||
            existingProductData.unidad_medida_presentacion !== newProductData.unidad_medida_presentacion;
          const wasDeactivatedAndNowActive = existingProductData.stock === false && newProductData.stock === true;

          if (isModified || wasDeactivatedAndNowActive) {
            productsToUpdate.push(newProductData);
          }
        }
      }

      for (const [id, existingProductData] of existingBranchProductsMap.entries()) {
        if (!newProductsInBranchMap.has(id)) {
          if (existingProductData.stock !== false) {
            const deactivatedProductData = {
              ...existingProductData,
              stock: false,
              ultima_actualizacion: currentTimestamp
            };
            productsToDeactivate.push(deactivatedProductData);
          }
        }
      }
    }
  }

  return {
    sucursalesFirestoreChanges: {
      toAdd: sucursalesToAdd,
      toUpdate: sucursalesToUpdate
    },
    productsFirestoreChanges: {
      toAdd: productsToAdd,
      toUpdate: productsToUpdate,
      toDeactivate: productsToDeactivate
    }
  };
}

// writeFinalJsons:
// - Para sucursales, NO las toca. Asume que ya están creadas manualmente.
// - Para productos, sobrescribe los JSONs locales con los datos nuevos del ZIP.
async function writeFinalJsons(allProductsByBranchFromZip) {
    const baseSuperDir = path.join(__dirname, '../src/data/super');
    await fsp.mkdir(baseSuperDir, { recursive: true });

    console.log(`\nVerificando archivos JSON de sucursales en '${baseSuperDir}'...`);
    // No hacemos nada con las sucursales aquí.
    // Si necesitas asegurarte de que los archivos de sucursales existan (aunque sea vacíos)
    // puedes añadir un bucle para crearlos si no están presentes, pero no los modificaremos.
    let totalUniqueSucursalesPresent = 0;
    for (const brandName of MARCAS_NORMALIZADAS_INTERES) {
        const safeBrandName = brandName.replace(/[^a-z0-9]/gi, '').toLowerCase();
        const branchFilename = path.join(baseSuperDir, `${safeBrandName}.json`);
        if (fs.existsSync(branchFilename)) {
            try {
                const data = await fsp.readFile(branchFilename, 'utf8');
                const existingList = JSON.parse(data);
                totalUniqueSucursalesPresent += existingList.length;
                console.log(`  Archivo de sucursales para '${brandName}' ya existe con ${existingList.length} entradas.`);
            } catch (error) {
                console.warn(`  [WARN] Error al leer archivo de sucursales existente para '${brandName}' (posiblemente corrupto, pero no se modificará):`, error.message);
            }
        } else {
            // Puedes decidir crear un archivo vacío si no existe, o simplemente dejar que no exista.
            // Para el propósito de "no modificar", lo dejaremos si no existe.
            // Si quieres que siempre exista, descomenta las siguientes 2 líneas:
            // await writeToJson([], branchFilename);
            // console.log(`  [INFO] Archivo de sucursales para '${brandName}' no encontrado, se creó vacío.`);
            console.log(`  [INFO] Archivo de sucursales para '${brandName}' no encontrado. No se creará ni modificará.`);
        }
    }
    console.log(`Verificación de sucursales locales completada. Total de sucursales en archivos existentes: ${totalUniqueSucursalesPresent}.`);


    // SECCIÓN DE PRODUCTOS: sobrescribe completamente con los datos del ZIP del día
    const baseProductsDir = path.join(__dirname, '../src/data/products');
    await fsp.mkdir(baseProductsDir, { recursive: true });

    console.log(`\nEscribiendo archivos JSON de productos (por marca y sucursal) en '${baseProductsDir}' (sobrescribiendo y limpiando)...`);

    // Limpiar directorios de productos (marca/archivos.json)
    const existingProductBrands = await fsp.readdir(baseProductsDir, { withFileTypes: true });
    for (const brandDirEntry of existingProductBrands) {
        if (brandDirEntry.isDirectory()) {
            const brandPath = path.join(baseProductsDir, brandDirEntry.name);
            console.log(`  Limpiando directorio de marca de productos existente: ${brandPath}`);
            await fsp.rm(brandPath, { recursive: true, force: true });
        }
    }

    let totalProductsFilesWritten = 0;
    for (const [brandName, branchesMap] of allProductsByBranchFromZip.entries()) {
        if (MARCAS_NORMALIZADAS_INTERES.has(brandName)) {
            const safeBrandName = brandName.replace(/[^a-z0-9]/gi, '').toLowerCase();
            const brandDir = path.join(baseProductsDir, safeBrandName);
            await fsp.mkdir(brandDir, { recursive: true });
            console.log(`  Creando directorio para marca de productos: ${brandName}`);

            for (const [branchId, productsList] of branchesMap.entries()) {
                const productFilename = path.join(brandDir, `${branchId}.json`);
                // productsList es un array, se escribe directamente
                await writeToJson(productsList, productFilename);
                totalProductsFilesWritten++;
                console.log(`    Escritos ${productsList.length} productos para ${brandName}/${branchId} en '${productFilename}'.`);
            }
        } else {
            console.log(`  Saltando escritura de productos para marca no interesada: '${brandName}'.`);
        }
    }
    console.log(`Generación de JSONs de productos finales completada. Total de archivos de productos escritos/actualizados: ${totalProductsFilesWritten}.`);
}


async function uploadBatchToFirestore(collectionName, documents, idField, operationType = 'set') {
  const BATCH_SIZE = 400;
  const COMMIT_TIMEOUT_MS = 60 * 1000;

  let batch = db.batch();
  let batchCount = 0;
  let uploadedCount = 0;
  let failedDocuments = [];
  let uploadStoppedDueToError = false;

  console.log(`\nIniciando subida por lotes a la colección '${collectionName}' para operación '${operationType}'. Total de documentos: ${documents.length}`);

  for (let i = 0; i < documents.length; i++) {
    if (uploadStoppedDueToError) {
      failedDocuments.push(documents[i]);
      continue;
    }

    const docData = documents[i];
    const docId = String(docData[idField]);

    if (!docId || docId === 'undefined' || docId === '[object Object]') {
      console.warn(`[SKIP] Documento sin ID válido en '${idField}'. Saltando documento:`, docData);
      failedDocuments.push(docData);
      continue;
    }

    const docRef = db.collection(collectionName).doc(docId);

    try {
      if (operationType === 'set') {
        batch.set(docRef, docData, { merge: true });
      } else if (operationType === 'update') {
        batch.update(docRef, docData);
      } else if (operationType === 'delete') {
        batch.delete(docRef);
      } else {
        console.warn(`[WARN] Tipo de operación desconocido: '${operationType}'. Saltando documento:`, docData);
        failedDocuments.push(docData);
        continue;
      }
      batchCount++;
    } catch (e) {
      console.error(`Error al preparar documento ${docId} para batch (${operationType}):`, e.message);
      failedDocuments.push(docData);
      uploadStoppedDueToError = true;
      break;
    }

    if (batchCount === BATCH_SIZE || i === documents.length - 1) {
      try {
        await Promise.race([
          batch.commit(),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout al commitear batch (${operationType}) a '${collectionName}'`)), COMMIT_TIMEOUT_MS))
        ]);
        uploadedCount += batchCount;
        console.log(`     Lote de ${batchCount} documentos (${operationType}) subido a '${collectionName}'. Total subidos: ${uploadedCount}`);
        batch = db.batch();
        batchCount = 0;
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`ERROR AL SUBIR LOTE (${operationType}) a la colección '${collectionName}'. Deteniendo la subida para esta colección.`, error);
        uploadStoppedDueToError = true;
        for (let j = i - batchCount + 1; j <= i; j++) {
            failedDocuments.push(documents[j]);
        }
        batch = db.batch();
        batchCount = 0;
        break;
      }
    }
  }

  if (batchCount > 0 && !uploadStoppedDueToError) {
    try {
      await Promise.race([
        batch.commit(),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout al commitear lote final (${operationType}) en '${collectionName}'`)), COMMIT_TIMEOUT_MS))
      ]);
      uploadedCount += batchCount;
      console.log(`     Lote final de ${batchCount} documentos (${operationType}) subido a '${collectionName}'. Total subidos: ${uploadedCount}`);
    } catch (error) {
      console.error(`ERROR AL SUBIR LOTE FINAL (${operationType}) a '${collectionName}'.`, error);
      uploadStoppedDueToError = true;
      for (let j = 0; j < documents.length; j++) {
        if (!failedDocuments.includes(documents[j])) {
          failedDocuments.push(documents[j]);
        }
      }
    }
  }

  console.log(`Subida de ${operationType}s a '${collectionName}' finalizada. Documentos subidos: ${uploadedCount}. Documentos fallidos: ${failedDocuments.length}`);
  return { successCount: uploadedCount, failedDocuments: failedDocuments, uploadStopped: uploadStoppedDueToError };
}

async function generarJsonFiltradosYSubirAFirestore() {
  try {
    console.log('Iniciando proceso de filtrado, generación de JSONs y subida a Firestore...');

    await fsp.mkdir(TEMP_DATA_DIR, { recursive: true });
    console.log(`Directorio temporal creado/verificado: ${TEMP_DATA_DIR}`);

    const today = new Date();
    const dayOfWeek = today.getDay();
    const currentDayZipUrl = DAILY_URLS[dayOfWeek];

    if (!currentDayZipUrl) {
      throw new Error(`No se encontró URL de descarga para el día de la semana actual (${dayOfWeek}). Por favor, verifica la constante DAILY_URLS.`);
    }
    console.log(`Intentando descargar ZIP desde: ${currentDayZipUrl}`);
    const bufferZip = await downloadZipForDay(currentDayZipUrl, tempZipPath);

    console.log('Descomprimiendo ZIP principal...');
    const directory = await unzipper.Open.buffer(bufferZip);

    let zipsInternos = directory.files.filter(f => {
      const fileName = path.basename(f.path);
      if (!fileName.toLowerCase().endsWith('.zip')) {
        return false;
      }
      const fileNameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'));
      for (const prefix of KNOWN_ZIPS_TO_PROCESS_PREFIXES) {
        if (fileNameWithoutExt.startsWith(prefix)) {
          return true;
        }
      }
      return false;
    });

    if (zipsInternos.length === 0) {
      console.error('No se encontraron ZIPs internos con los prefijos especificados para procesar.');
      const allFoundZips = directory.files.filter(f => f.path.toLowerCase().endsWith('.zip')).map(f => path.basename(f.path));
      console.log('ZIPs internos encontrados en el archivo principal (sin filtrar por prefijo):', allFoundZips);
      process.exit(1);
    }

    console.log(`Encontrados ${zipsInternos.length} ZIPs internos especificados para procesar.`);
    console.log('Listando ZIPs internos que serán procesados:');
    zipsInternos.forEach(zip => console.log(`- ${zip.path}`));

    const allFilteredSucursalesByBrand = new Map();
    const allProductsByBranch = new Map();

    for (const zip of zipsInternos) {
      console.log(`Procesando ZIP interno: ${zip.path}`);
      try {
        const bufferZipInterno = await zip.buffer();
        await procesarZipInterno(bufferZipInterno, allFilteredSucursalesByBrand, allProductsByBranch, path.basename(zip.path));
      } catch (innerZipError) {
        console.error(`Error al extraer o procesar el ZIP interno ${zip.path}. Saltando.`, innerZipError);
      }
    }
    console.log('\nTodos los ZIPs internos procesados.');

    console.log('\n--- Cargando datos locales existentes para comparación ---');
    const existingLocalSucursales = await loadLocalJsonData(BASE_SUPER_DIR, false);
    const existingLocalProducts = await loadLocalJsonData(BASE_PRODUCTS_DIR, true);
    console.log(`Sucursales locales existentes cargadas: ${existingLocalSucursales.size}`);
    console.log(`Marcas de productos locales existentes cargadas: ${existingLocalProducts.size}`);

    console.log('\n--- Realizando comparación para preparar cambios de Firestore ---');
    const {
      sucursalesFirestoreChanges,
      productsFirestoreChanges
    } = await compareDataAndPrepareFirestoreChanges(
      allFilteredSucursalesByBrand, allProductsByBranch,
      existingLocalSucursales, existingLocalProducts
    );

    console.log('\nResumen de cambios detectados para Firestore:');
    console.log(`  Sucursales: Añadir: ${sucursalesFirestoreChanges.toAdd.length}, Actualizar: ${sucursalesFirestoreChanges.toUpdate.length}`);
    console.log(`  Productos: Añadir: ${productsFirestoreChanges.toAdd.length}, Actualizar: ${productsFirestoreChanges.toUpdate.length}, Desactivar: ${productsFirestoreChanges.toDeactivate.length}`);

    // --- Escribir los JSONs locales ---
    console.log('\n--- Escribiendo archivos JSON locales: Productos (sobrescribir), Sucursales (mantener existentes) ---');
    // Pasamos solo allProductsByBranch para que writeFinalJsons solo sobrescriba productos.
    // La lógica para sucursales dentro de writeFinalJsons asegurará que no se modifiquen.
    await writeFinalJsons(allProductsByBranch);
    console.log('Archivos JSON locales actualizados completamente (productos sobrescritos, sucursales mantenidas).');


    // --- Subir SOLO los CAMBIOS a Firestore ---
    let firestoreUploadFailed = false;

    console.log('\n--- Subiendo CAMBIOS de sucursales a Firestore ---');
    const uniqueBrandsForSucursales = new Set([
        ...sucursalesFirestoreChanges.toAdd.map(s => s.marca),
        ...sucursalesFirestoreChanges.toUpdate.map(s => s.marca)
    ]);

    for (const brandName of uniqueBrandsForSucursales) {
      const safeBrandName = brandName.replace(/[^a-z0-9]/gi, '').toLowerCase();
      const collectionPath = `supermercados/${safeBrandName}/sucursales`;

      const sucursalesToAddForBrand = sucursalesFirestoreChanges.toAdd.filter(s => s.marca === brandName);
      const sucursalesToUpdateForBrand = sucursalesFirestoreChanges.toUpdate.filter(s => s.marca === brandName);

      if (sucursalesToAddForBrand.length > 0) {
        console.log(`  > Añadiendo ${sucursalesToAddForBrand.length} sucursales nuevas para ${brandName}...`);
        const { failedDocuments, uploadStopped } = await uploadBatchToFirestore(collectionPath, sucursalesToAddForBrand, 'id_sucursal', 'set');
        if (failedDocuments.length > 0 || uploadStopped) firestoreUploadFailed = true;
      }
      if (sucursalesToUpdateForBrand.length > 0) {
        console.log(`  > Actualizando ${sucursalesToUpdateForBrand.length} sucursales existentes para ${brandName}...`);
        const { failedDocuments, uploadStopped } = await uploadBatchToFirestore(collectionPath, sucursalesToUpdateForBrand, 'id_sucursal', 'update');
        if (failedDocuments.length > 0 || uploadStopped) firestoreUploadFailed = true;
      }
    }
    console.log('Subida de sucursales a Firestore finalizada.');

    console.log('\n--- Subiendo CAMBIOS de productos a Firestore ---');
    const allProductsForFirestore = [...productsFirestoreChanges.toAdd, ...productsFirestoreChanges.toUpdate, ...productsFirestoreChanges.toDeactivate];
    const uniqueProductBranches = new Set(allProductsForFirestore.map(p => `${p.supermercado_marca}_${p.sucursal_id}`));

    for (const branchKey of uniqueProductBranches) {
      const [brandName, branchId] = branchKey.split('_');
      const safeBrandName = brandName.replace(/[^a-z0-9]/gi, '').toLowerCase();
      const collectionPath = `supermercados/${safeBrandName}/sucursales/${branchId}/productos`;

      const productsToAddForBranch = productsFirestoreChanges.toAdd.filter(p => p.supermercado_marca === brandName && p.sucursal_id === branchId);
      const productsToUpdateForBranch = productsFirestoreChanges.toUpdate.filter(p => p.supermercado_marca === brandName && p.sucursal_id === branchId);
      const productsToDeactivateForBranch = productsFirestoreChanges.toDeactivate.filter(p => p.supermercado_marca === brandName && p.sucursal_id === branchId);

      if (productsToAddForBranch.length > 0) {
        console.log(`  > Añadiendo ${productsToAddForBranch.length} productos nuevos para ${brandName}/${branchId}...`);
        const { failedDocuments, uploadStopped } = await uploadBatchToFirestore(collectionPath, productsToAddForBranch, 'id', 'set');
        if (failedDocuments.length > 0 || uploadStopped) firestoreUploadFailed = true;
      }
      if (productsToUpdateForBranch.length > 0) {
        console.log(`  > Actualizando ${productsToUpdateForBranch.length} productos para ${brandName}/${branchId}...`);
        const { failedDocuments, uploadStopped } = await uploadBatchToFirestore(collectionPath, productsToUpdateForBranch, 'id', 'update');
        if (failedDocuments.length > 0 || uploadStopped) firestoreUploadFailed = true;
      }
      if (productsToDeactivateForBranch.length > 0) {
        console.log(`  > Desactivando ${productsToDeactivateForBranch.length} productos para ${brandName}/${branchId}...`);
        const { failedDocuments, uploadStopped } = await uploadBatchToFirestore(collectionPath, productsToDeactivateForBranch, 'id', 'update');
        if (failedDocuments.length > 0 || uploadStopped) firestoreUploadFailed = true;
      }
    }
    console.log('Subida de productos a Firestore finalizada.');

    if (firestoreUploadFailed) {
      console.error('\nEl proceso finalizó con ALGUNOS ERRORES en la subida a Firestore. Revisa los logs anteriores para más detalles.');
      process.exit(1);
    } else {
      console.log('\nProceso completado exitosamente. Todos los datos de interés fueron procesados y subidos a Firestore.');
      process.exit(0);
    }

  } catch (error) {
    console.error('\nError crítico en el proceso general:', error);
    process.exit(1);
  } finally {
        try {
            await cleanTempJsons();
        } catch (cleanupError) {
            if (cleanupError.code !== 'ENOENT') {
                console.warn(`No se pudo completar la limpieza de archivos temporales:`, cleanupError);
            }
        }
    }
}

generarJsonFiltradosYSubirAFirestore();