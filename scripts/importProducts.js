// importProducts.js
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
const crypto = require('crypto');

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

if (!serviceAccountPath) {
  console.error('Error: La variable de entorno FIREBASE_SERVICE_ACCOUNT_KEY no está definida.');
  console.error('Para uso local, configúrala en tu archivo .env (ej: FIREBASE_SERVICE_ACCOUNT_KEY=\'./serviceAccountKey.json\').');
  console.error('Para GitHub Actions, asegúrate de que el workflow la pase como variable de entorno.');
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = require(path.resolve(process.cwd(), serviceAccountPath));
  console.log(`Credenciales de Firebase cargadas desde el archivo: ${serviceAccountPath}`);
} catch (error) {
  console.error(`Error al cargar el archivo de cuenta de servicio de Firebase desde ${serviceAccountPath}:`, error);
  console.error(`Asegúrate de que la ruta en FIREBASE_SERVICE_ACCOUNT_KEY es correcta y el archivo existe.`);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = getFirestore();
const pipeline = promisify(stream.pipeline);

// --- CONSTANTES ---
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
const FIRESTORE_OVERFLOW_FILE = path.join(__dirname, '../src/data/firestore_overflow.json');

const KNOWN_ZIPS_TO_PROCESS_PREFIXES = new Set([
  'sepa_1_comercio-sepa-10_', // Carrefour
  'sepa_1_comercio-sepa-11_', // ChangoMas
  'sepa_1_comercio-sepa-15_'  // Dia
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

const PRODUCT_CSV_TO_TARGET_MAPPING = [
  { product_csv_id_comercio: '10', product_csv_id_bandera: '1', product_csv_id_sucursal: '1', target_brand: 'Carrefour', target_sucursal_id: '1' },
  { product_csv_id_comercio: '15', product_csv_id_bandera: '1', product_csv_id_sucursal: '87', target_brand: 'Dia', target_sucursal_id: '87' },
  { product_csv_id_comercio: '11', product_csv_id_bandera: '5', product_csv_id_sucursal: '1004', target_brand: 'ChangoMas', target_sucursal_id: '1004' }
];

const FIRESTORE_WRITE_LIMIT = 19000;

// --- Funciones Auxiliares ---

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadZipForDay(url, outputPath) {
  console.log(`Descargando ZIP para el día desde: ${url}`);
  try {
    const response = await fetch(url, { timeout: 60000 }); // 60 segundos de timeout

    if (!response.ok) {
      throw new Error(`Error HTTP al descargar el ZIP: ${response.statusText} (Status: ${response.status})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await fsp.writeFile(outputPath, buffer);
    console.log(`ZIP del día descargado en ${outputPath}.`);
    return buffer;
  } catch (error) {
    console.error(`ERROR al descargar el ZIP de ${url}:`, error.message);
    throw error;
  }
}

async function downloadZipWithRetries(url, outputPath, maxRetries = 3, retryDelayMs = 5000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`Intentando descargar ZIP (Intento ${i + 1}/${maxRetries}) desde: ${url}`);
      const buffer = await downloadZipForDay(url, outputPath);
      return buffer;
    } catch (error) {
      console.error(`Error al descargar el ZIP (Intento ${i + 1}/${maxRetries}):`, error.message);
      if (i < maxRetries - 1) {
        console.log(`Reintentando en ${retryDelayMs / 1000} segundos...`);
        await sleep(retryDelayMs);
      } else {
        throw new Error(`Falla crítica: No se pudo descargar el ZIP de ${url} después de ${maxRetries} intentos.`);
      }
    }
  }
}

async function writeToJson(data, filename) {
  if (!data || (Array.isArray(data) && data.length === 0 && filename !== FIRESTORE_OVERFLOW_FILE)) {
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
    const readBufferLimit = 1024 * 5; // Leer hasta 5KB para detectar el delimitador
    const passthrough = new stream.PassThrough();

    const commonColumnMaps = {
      'id_comercio': ['id_comercio', 'id'],
      'id_sucursal': ['id_sucursal', '0', '1', '2', 'sucursal_id'],
      'id_bandera': ['id_bandera', 'bandera_id'],
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
      'sucursales_localidad': ['sucursales_localidad', 'localidad'],
      'id_producto': ['id_producto', 'producto_id'] // Asegúrate de que 'id_producto' esté aquí
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
            console.warn(`[WARN] Delimitador inferido heurísticamente para ${filenameForLog} como '${detectedDelimiter}'.`);
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
            console.warn(`[WARN] Archivo ${filenameForLog} es muy pequeño o no tiene saltos de línea. Procesando con delimitador inferido: '${detectedDelimiter}'.`);
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

function normalizeProductData(product, targetBrand, targetSucursalId) {
  if (!product.productos_descripcion || !product.productos_precio_lista) {
    // console.warn('Producto con datos faltantes (descripción o precio), saltando:', product);
    return null;
  }

  const sanitizedEan = String(product.productos_ean || '').replace(/\D/g, ''); // Asegúrate de que no sea undefined

  let uniqueIdentifier;
  if (product.id_producto && String(product.id_producto).trim() !== '' && String(product.id_producto).trim() !== '0') {
    uniqueIdentifier = String(product.id_producto).trim();
  } else if (sanitizedEan && sanitizedEan !== '0') {
    uniqueIdentifier = sanitizedEan;
  } else {
    const fallbackSource = `${product.productos_descripcion || 'NODESC'}-${product.productos_marca || 'NOMARCA'}-${product.productos_cantidad_presentacion || 'NOQTY'}-${product.productos_unidad_medida_presentacion || 'NOUNIT'}`;
    uniqueIdentifier = crypto.createHash('md5')
      .update(`${fallbackSource}-${Date.now()}-${Math.random()}`)
      .digest('base64')
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 16);

    console.warn(`[WARN] id_producto y EAN inválidos o cero para producto '${product.productos_descripcion}' (id_producto original: '${product.id_producto || 'vacío'}', EAN original: '${product.productos_ean || 'vacío'}'). Generando ID de respaldo: ${uniqueIdentifier}`);
  }

  // MODIFICACIÓN CRÍTICA AQUÍ: Combina el uniqueIdentifier con el targetSucursalId
  const productId = `${uniqueIdentifier}-${targetSucursalId}`;

  let precio = parseFloat(String(product.productos_precio_lista).replace(',', '.'));
  if (isNaN(precio)) {
    // console.warn(`Precio inválido para producto '${product.productos_descripcion}' (EAN: '${product.productos_ean || uniqueIdentifier}'):`, product.productos_precio_lista);
    precio = 0;
  }

  return {
    id: productId,
    ean: sanitizedEan,
    nombre: product.productos_descripcion.trim(),
    marca_producto: product.productos_marca ? product.productos_marca.trim() : 'Sin Marca',
    precio: precio,
    cantidad_presentacion: product.productos_cantidad_presentacion ? product.productos_cantidad_presentacion.trim() : '1',
    unidad_medida_presentacion: product.productos_unidad_medida_presentacion ? product.productos_unidad_medida_presentacion.trim() : 'unidad',
    supermercado_marca: targetBrand,
    sucursal_id: targetSucursalId,
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

  let sucursalFile = null;
  let productFile = null;

  for (const file of innerDirectory.files) {
    const fileNameLower = file.path.toLowerCase();
    if (fileNameLower.includes('sucursal') && fileNameLower.endsWith('.csv')) {
      sucursalFile = file;
    } else if (fileNameLower.includes('producto') && fileNameLower.endsWith('.csv')) {
      productFile = file;
    }
  }

  if (!sucursalFile) {
    console.warn(`[WARN] ZIP interno '${zipFileName}' no contiene archivo de sucursales. Saltando sucursales para este ZIP.`);
  }

  if (!productFile) {
    console.warn(`[WARN] ZIP interno '${zipFileName}' no contiene archivo de productos. Saltando productos para este ZIP.`);
  }

  // Procesar sucursales
  if (sucursalFile) {
    try {
      const sucursalStream = sucursalFile.stream();
      const sucursalDocs = await procesarCsvStream(sucursalStream, sucursalFile.path);
      for (const doc of sucursalDocs) {
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
    } catch (error) {
      console.error(`Error al procesar archivo de sucursal en '${zipFileName}':`, error.message);
    }
  }

  // Procesar productos
  if (productFile) {
    try {
      const productStream = productFile.stream();
      const productDocs = await procesarCsvStream(productStream, productFile.path);

      for (const doc of productDocs) {
        const productCsvIdComercio = String(doc.id_comercio || '');
        const productCsvIdBandera = String(doc.id_bandera || '');
        const productCsvIdSucursal = String(doc.id_sucursal || '');

        let targetBrand = null;
        let targetSucursalId = null;

        const matchedMapping = PRODUCT_CSV_TO_TARGET_MAPPING.find(mapping =>
          mapping.product_csv_id_comercio === productCsvIdComercio &&
          mapping.product_csv_id_bandera === productCsvIdBandera &&
          mapping.product_csv_id_sucursal === productCsvIdSucursal
        );

        if (matchedMapping) {
          targetBrand = matchedMapping.target_brand;
          targetSucursalId = matchedMapping.target_sucursal_id;
        }

        if (targetBrand && MARCAS_NORMALIZADAS_INTERES.has(targetBrand)) {
          const normalizedProduct = normalizeProductData(doc, targetBrand, targetSucursalId);
          if (normalizedProduct) {
            if (!allProductsByBranch.has(targetBrand)) {
              allProductsByBranch.set(targetBrand, new Map());
            }
            if (!allProductsByBranch.get(targetBrand).has(targetSucursalId)) {
              allProductsByBranch.get(targetBrand).set(targetSucursalId, []);
            }
            allProductsByBranch.get(targetBrand).get(targetSucursalId).push(normalizedProduct);
          }
        } else {
          // console.log(`[SKIP] Producto del ZIP '${zipFileName}' no mapeado o marca no interesada: `,
          //           `id_comercio=${productCsvIdComercio}, id_bandera=${productCsvIdBandera}, id_sucursal=${productCsvIdSucursal}`);
        }
      }
    } catch (error) {
      console.error(`Error al procesar archivo de productos en '${zipFileName}':`, error.message);
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
        if (!MARCAS_NORMALIZADAS_INTERES.has(brandName.charAt(0).toUpperCase() + brandName.slice(1))) {
          continue;
        }
        const brandPath = path.join(basePath, brandDirEntry.name);
        const productsByBranch = new Map();

        const branchFiles = await fsp.readdir(brandPath, { withFileTypes: true });
        for (const branchFileEntry of branchFiles) {
          if (branchFileEntry.isFile() && branchFileEntry.name.endsWith('.json')) {
            const branchId = branchFileEntry.name.split('.')[0];
            const targetSucursalExists = TARGET_SUPERMARKETS_LOCATIONS.some(ts => String(ts.id_sucursal) === branchId && ts.brand.toLowerCase() === brandName.toLowerCase());

            if (targetSucursalExists) {
              try {
                const productsList = JSON.parse(await fsp.readFile(path.join(brandPath, branchFileEntry.name), 'utf8'));
                const productsInBranchMap = new Map();
                productsList.forEach(p => productsInBranchMap.set(p.id, p));
                productsByBranch.set(branchId, productsInBranchMap);
              } catch (error) {
                console.warn(`[WARN] Error al leer productos de ${path.join(brandPath, branchFileEntry.name)}:`, error.message);
              }
            } else {
              console.log(`[INFO] Saltando carga de productos para sucursal '${branchId}' de marca '${brandName}' no objetivo.`);
            }
          }
        }
        dataMap.set(brandName.charAt(0).toUpperCase() + brandName.slice(1), productsByBranch);
      }
    }
  } else {
    for (const fileEntry of brandDirs) {
      if (fileEntry.isFile() && fileEntry.name.endsWith('.json')) {
        const idSucursalFromFile = fileEntry.name.split('.')[0];
        const targetSucursal = TARGET_SUPERMARKETS_LOCATIONS.find(ts => String(ts.id_sucursal) === idSucursalFromFile);

        if (!targetSucursal || !MARCAS_NORMALIZADAS_INTERES.has(targetSucursal.brand)) {
          continue;
        }
        try {
          const sucursalesList = JSON.parse(await fsp.readFile(path.join(basePath, fileEntry.name), 'utf8'));
          if (sucursalesList.length > 0 && String(sucursalesList[0].id_sucursal) === idSucursalFromFile) {
            dataMap.set(sucursalesList[0].id_sucursal, sucursalesList[0]);
          }
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

  // --- Comparación de Sucursales ---
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

  // --- Comparación de Productos ---
  for (const [brandName, newBranchesMap] of newProductsByBranch.entries()) {
    if (!MARCAS_NORMALIZADAS_INTERES.has(brandName)) {
      continue;
    }

    const existingBrandProductsMap = existingLocalProducts.get(brandName) || new Map();

    for (const [branchId, newProductsList] of newBranchesMap.entries()) {
      const existingBranchProductsMap = existingBrandProductsMap.get(branchId) || new Map();
      const newProductsInBranchMap = new Map();
      newProductsList.forEach(p => newProductsInBranchMap.set(p.id, p));

      // Verificar productos nuevos o modificados
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

      // Verificar productos a desactivar (que ya no están en los datos nuevos)
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

async function writeFinalJsons(allProductsByBranchFromZip) {
  const baseSuperDir = BASE_SUPER_DIR;
  await fsp.mkdir(baseSuperDir, { recursive: true });

  console.log(`\nVerificando archivos JSON de sucursales en '${baseSuperDir}'...`);
  let totalUniqueSucursalesPresent = 0;
  for (const targetSucursal of TARGET_SUPERMARKETS_LOCATIONS) {
    if (!MARCAS_NORMALIZADAS_INTERES.has(targetSucursal.brand)) {
      continue;
    }
    const branchFilename = path.join(baseSuperDir, `${targetSucursal.id_sucursal}.json`);
    if (fs.existsSync(branchFilename)) {
      try {
        const data = await fsp.readFile(branchFilename, 'utf8');
        const existingList = JSON.parse(data);
        totalUniqueSucursalesPresent += existingList.length;
        console.log(`    Archivo de sucursales para '${targetSucursal.brand}' (ID ${targetSucursal.id_sucursal}) ya existe.`);
      } catch (error) {
        console.warn(`    [WARN] Error al leer archivo de sucursal existente para '${targetSucursal.brand}' (ID ${targetSucursal.id_sucursal}) (posiblemente corrupto, pero no se modificará):`, error.message);
      }
    } else {
      console.log(`    [INFO] Archivo de sucursales para '${targetSucursal.brand}' (ID ${targetSucursal.id_sucursal}) no encontrado. No se creará ni modificará.`);
    }
  }
  console.log(`Verificación de sucursales locales completada. Total de sucursales en archivos existentes: ${totalUniqueSucursalesPresent}.`);

  const baseProductsDir = BASE_PRODUCTS_DIR;
  await fsp.mkdir(baseProductsDir, { recursive: true });

  console.log(`\nEscribiendo archivos JSON de productos (por marca y sucursal) en '${baseProductsDir}' (sobrescribiendo y limpiando)...`);

  const existingProductBrands = await fsp.readdir(baseProductsDir, { withFileTypes: true });
  for (const brandDirEntry of existingProductBrands) {
    if (brandDirEntry.isDirectory()) {
      const brandPath = path.join(baseProductsDir, brandDirEntry.name);
      console.log(`    Limpiando directorio de marca de productos existente: ${brandPath}`);
      await fsp.rm(brandPath, { recursive: true, force: true });
    }
  }

  let totalProductsFilesWritten = 0;
  for (const [brandName, branchesMap] of allProductsByBranchFromZip.entries()) {
    if (MARCAS_NORMALIZADAS_INTERES.has(brandName)) {
      const safeBrandName = brandName.replace(/[^a-z0-9]/gi, '').toLowerCase();
      const brandDir = path.join(baseProductsDir, safeBrandName);
      await fsp.mkdir(brandDir, { recursive: true });
      console.log(`    Creando directorio para marca de productos: ${brandName}`);

      for (const [branchId, productsList] of branchesMap.entries()) {
        const isTargetBranch = TARGET_SUPERMARKETS_LOCATIONS.some(ts =>
          String(ts.id_sucursal) === String(branchId) && ts.brand === brandName
        );

        if (isTargetBranch) {
          const productFilename = path.join(brandDir, `${branchId}.json`);
          await writeToJson(productsList, productFilename);
          totalProductsFilesWritten++;
          console.log(`      Escritos ${productsList.length} productos para ${brandName}/${branchId} en '${productFilename}'.`);
        } else {
          console.log(`      Saltando escritura de productos para sucursal no objetivo: '${brandName}/${branchId}'.`);
        }
      }
    } else {
      console.log(`    Saltando escritura de productos para marca no interesada: '${brandName}'.`);
    }
  }
  console.log(`Generación de JSONs de productos finales completada. Total de archivos de productos escritos/actualizados: ${totalProductsFilesWritten}.`);
}

/**
 * Sube un lote de documentos a Firestore, respetando un límite total de operaciones y con reintentos.
 * @param {string} collectionName - Nombre de la colección.
 * @param {Array<Object>} documents - Array de documentos a subir.
 * @param {string} idField - Campo del documento a usar como ID en Firestore.
 * @param {'set'|'update'|'delete'} operationType - Tipo de operación ('set', 'update', 'delete').
 * @param {{currentCount: number}} totalOperationsCounter - Objeto mutable para rastrear el total de operaciones.
 * @returns {Promise<{successCount: number, failedDocuments: Array<Object>, uploadStopped: boolean, remainingDocuments: Array<Object>}>} Resultado de la subida.
 */
async function uploadBatchToFirestore(collectionName, documents, idField, operationType = 'set', totalOperationsCounter) {
  const BATCH_SIZE = 400;
  const MAX_RETRIES = 5; // Número máximo de reintentos para un lote
  const INITIAL_RETRY_DELAY_MS = 1000; // 1 segundo de retardo inicial
  // El COMMIT_TIMEOUT_MS de 60 segundos es el timeout del *lado del cliente* para el commit,
  // Firestore tiene su propio timeout interno, que es lo que usualmente falla.

  let batch = db.batch();
  let batchCount = 0;
  let uploadedCount = 0;
  let failedDocuments = []; // Documentos que fallaron después de todos los reintentos
  let remainingDocuments = []; // Documentos que no se intentaron subir por límite global
  let uploadStoppedDueToGlobalLimit = false;

  console.log(`\nIniciando subida por lotes a la colección '${collectionName}' para operación '${operationType}'. Total de documentos: ${documents.length}`);

  for (let i = 0; i < documents.length; i++) {
    // Si la carga se detuvo por el límite global, añadir los restantes
    if (uploadStoppedDueToGlobalLimit) {
      remainingDocuments.push(documents[i]);
      continue;
    }

    // Verificar si hemos alcanzado el límite de operaciones global antes de añadir al batch
    if (totalOperationsCounter.currentCount >= FIRESTORE_WRITE_LIMIT) {
      console.warn(`[LÍMITE FIRESTORE] Se alcanzó el límite de ${FIRESTORE_WRITE_LIMIT} operaciones. Guardando ${documents.length - i} documentos restantes para la próxima ejecución.`);
      remainingDocuments.push(...documents.slice(i));
      uploadStoppedDueToGlobalLimit = true;
      break;
    }

    const docData = documents[i];
    const docId = String(docData[idField]);

    if (!docId || docId === 'undefined' || docId === '[object Object]' || docId.trim() === '') {
      console.warn(`[SKIP] Documento sin ID válido o vacío en '${idField}'. Saltando documento:`, docData);
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
      totalOperationsCounter.currentCount++; // Incrementa el contador global por cada operación preparada
    } catch (e) {
      console.error(`Error al preparar documento ${docId} para batch (${operationType}):`, e.message);
      failedDocuments.push(docData);
      // Si hay un error al PREPARAR el documento, no lo incluimos en el batch.
      // Esto no detiene la subida completa, solo salta este documento.
      // Decrementamos el contador porque no se preparó para el batch.
      totalOperationsCounter.currentCount--;
      continue;
    }

    // Si el batch está lleno o es el último documento
    if (batchCount === BATCH_SIZE || i === documents.length - 1) {
      let currentBatchSuccess = false;
      let currentBatchError = null;

      for (let retryCount = 0; retryCount < MAX_RETRIES; retryCount++) {
        try {
          // El Promise.race es para nuestro timeout del cliente, pero el error de Firestore es más común.
          await Promise.race([
            batch.commit(),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout al commitear batch (${operationType}) a '${collectionName}'`)), COMMIT_TIMEOUT_MS))
          ]);
          uploadedCount += batchCount;
          console.log(`    Lote de ${batchCount} documentos (${operationType}) subido a '${collectionName}'. Total subidos en este lote: ${uploadedCount}. Total global de operaciones: ${totalOperationsCounter.currentCount}`);
          currentBatchSuccess = true;
          break; // Salir del bucle de reintentos
        } catch (error) {
          currentBatchError = error;
          console.error(`ERROR AL SUBIR LOTE (${operationType}) a la colección '${collectionName}'. Intento ${retryCount + 1}/${MAX_RETRIES}. Error:`, error.message);

          // Reintenta para errores de timeout o internos del servidor de Firestore (códigos gRPC)
          // https://grpc.github.io/grpc/core/md_doc_statuscodes.html
          if (error.code === 4 /* DEADLINE_EXCEEDED (timeout) */ ||
            error.code === 10 /* ABORTED */ ||
            error.code === 13 /* UNAVAILABLE */ ||
            error.message.includes('Timeout al commitear batch')) { // Mensaje de nuestro timeout

            if (retryCount < MAX_RETRIES - 1) {
              const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);
              console.warn(`Reintentando en ${delay / 1000} segundos...`);
              await new Promise(resolve => setTimeout(resolve, delay));
            } else {
              console.error(`Todos los reintentos fallaron para el lote (${operationType}) en '${collectionName}'.`);
            }
          } else if (error.code === 5 /* NOT_FOUND */ && operationType === 'update') {
            // Si es NOT_FOUND en un update, no tiene sentido reintentar; el documento no existe.
            console.error(`Error NOT_FOUND: El documento no existe para actualizar en '${collectionName}'. No se reintentará.`);
            break; // Salir del bucle de reintentos
          } else {
            // Otro tipo de error, no reintentar
            console.error(`Error no reintentable para el lote. Deteniendo la subida de este lote.`);
            break; // Salir del bucle de reintentos
          }
        }
      }

      if (!currentBatchSuccess) {
        // Si el lote falló después de todos los reintentos, o por un error no reintentable
        console.error(`FALLO PERMANENTE del lote (${operationType}) a '${collectionName}'. Los documentos de este lote se añadirán a fallidos.`);
        // Añadir los documentos de este lote a la lista de fallidos
        const startIndex = i - batchCount + 1;
        for (let j = startIndex; j <= i; j++) {
          failedDocuments.push(documents[j]);
        }
        // Decrementar del contador global las operaciones de este lote que no se subieron
        totalOperationsCounter.currentCount -= batchCount;
      }

      batch = db.batch(); // Reiniciar el batch para el siguiente ciclo
      batchCount = 0;
      // Pequeña pausa para evitar límites de escritura, incluso si falló el commit
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  // Devolver los resultados
  return {
    successCount: uploadedCount,
    failedDocuments: failedDocuments,
    uploadStopped: uploadStoppedDueToGlobalLimit, // Si se detuvo por el límite global
    remainingDocuments: remainingDocuments // Documentos que no se llegaron a procesar por el límite global
  };
}


// --- Función Principal de Ejecución ---
async function generarJsonFiltradosYSubirAFirestore() {
  let totalFirestoreOperations = { currentCount: 0 };
  let overflowData = {
    sucursales: {
      toAdd: [],
      toUpdate: []
    },
    productos: {
      toAdd: [],
      toUpdate: [],
      toDeactivate: []
    }
  };

  try {
    console.log('Iniciando proceso de filtrado, generación de JSONs y subida a Firestore...');

    await fsp.mkdir(TEMP_DATA_DIR, { recursive: true });
    console.log(`Directorio temporal creado/verificado: ${TEMP_DATA_DIR}`);

    // --- Paso 1: Intentar cargar datos de desbordamiento de la ejecución anterior ---
    console.log('\n--- Verificando y subiendo datos de desbordamiento de Firestore (si existen) ---');
    if (fs.existsSync(FIRESTORE_OVERFLOW_FILE)) {
      try {
        const overflowContent = await fsp.readFile(FIRESTORE_OVERFLOW_FILE, 'utf8');
        const loadedOverflow = JSON.parse(overflowContent);

        // Solo si loadedOverflow tiene la estructura esperada y contenido relevante
        if (loadedOverflow && loadedOverflow.sucursales && loadedOverflow.productos &&
          (loadedOverflow.sucursales.toAdd.length > 0 || loadedOverflow.sucursales.toUpdate.length > 0 ||
            loadedOverflow.productos.toAdd.length > 0 || loadedOverflow.productos.toUpdate.length > 0 || loadedOverflow.productos.toDeactivate.length > 0)) {

          console.log(`Se encontraron datos de desbordamiento de ${FIRESTORE_OVERFLOW_FILE}. Intentando subir primero estos.`);

          // Reiniciar overflowData para capturar lo que *realmente* no se sube AHORA
          overflowData = {
            sucursales: { toAdd: [], toUpdate: [] },
            productos: { toAdd: [], toUpdate: [], toDeactivate: [] }
          };

          // Subir sucursales del desbordamiento
          const overflowSucursalesToAdd = loadedOverflow.sucursales.toAdd;
          const overflowSucursalesToUpdate = loadedOverflow.sucursales.toUpdate;

          if (overflowSucursalesToAdd.length > 0 || overflowSucursalesToUpdate.length > 0) {
            console.log(`    > Intentando subir ${overflowSucursalesToAdd.length} sucursales a añadir y ${overflowSucursalesToUpdate.length} a actualizar del desbordamiento...`);
            const uniqueBrandsForOverflowSucursales = new Set([...overflowSucursalesToAdd.map(s => s.marca), ...overflowSucursalesToUpdate.map(s => s.marca)]);

            for (const brandName of uniqueBrandsForOverflowSucursales) {
              const safeBrandName = brandName.replace(/[^a-z0-9]/gi, '').toLowerCase();
              const collectionPath = `supermercados/${safeBrandName}/sucursales`;

              const toAddForBrand = overflowSucursalesToAdd.filter(s => s.marca === brandName);
              const toUpdateForBrand = overflowSucursalesToUpdate.filter(s => s.marca === brandName);

              if (toAddForBrand.length > 0) {
                const result = await uploadBatchToFirestore(collectionPath, toAddForBrand, 'id_sucursal', 'set', totalFirestoreOperations);
                overflowData.sucursales.toAdd.push(...result.failedDocuments, ...result.remainingDocuments);
                if (result.uploadStopped) throw new Error('Carga de desbordamiento de sucursales (añadir) detenida por error o límite.');
              }
              if (totalFirestoreOperations.currentCount >= FIRESTORE_WRITE_LIMIT) break;

              if (toUpdateForBrand.length > 0) {
                const result = await uploadBatchToFirestore(collectionPath, toUpdateForBrand, 'id_sucursal', 'update', totalFirestoreOperations);
                overflowData.sucursales.toUpdate.push(...result.failedDocuments, ...result.remainingDocuments);
                if (result.uploadStopped) throw new Error('Carga de desbordamiento de sucursales (actualizar) detenida por error o límite.');
              }
              if (totalFirestoreOperations.currentCount >= FIRESTORE_WRITE_LIMIT) break;
            }
          }

          // Subir productos del desbordamiento
          const overflowProductsToAdd = loadedOverflow.productos.toAdd;
          const overflowProductsToUpdate = loadedOverflow.productos.toUpdate;
          const overflowProductsToDeactivate = loadedOverflow.productos.toDeactivate;

          if (overflowProductsToAdd.length > 0 || overflowProductsToUpdate.length > 0 || overflowProductsToDeactivate.length > 0) {
            console.log(`    > Intentando subir ${overflowProductsToAdd.length} productos a añadir, ${overflowProductsToUpdate.length} a actualizar y ${overflowProductsToDeactivate.length} a desactivar del desbordamiento...`);
            const uniqueProductBranches = new Set([
              ...overflowProductsToAdd.map(p => `${p.supermercado_marca}_${p.sucursal_id}`),
              ...overflowProductsToUpdate.map(p => `${p.supermercado_marca}_${p.sucursal_id}`),
              ...overflowProductsToDeactivate.map(p => `${p.supermercado_marca}_${p.sucursal_id}`)
            ]);

            for (const branchKey of uniqueProductBranches) {
              if (totalFirestoreOperations.currentCount >= FIRESTORE_WRITE_LIMIT) {
                // Si se alcanzó el límite aquí, añadir el resto de los productos de desbordamiento pendientes
                const remainingBranches = Array.from(uniqueProductBranches).slice(Array.from(uniqueProductBranches).indexOf(branchKey));
                for (const rKey of remainingBranches) {
                  const [rBrandName, rBranchId] = rKey.split('_');
                  overflowData.productos.toAdd.push(...overflowProductsToAdd.filter(p => p.supermercado_marca === rBrandName && p.sucursal_id === rBranchId));
                  overflowData.productos.toUpdate.push(...overflowProductsToUpdate.filter(p => p.supermercado_marca === rBrandName && p.sucursal_id === rBranchId));
                  overflowData.productos.toDeactivate.push(...overflowProductsToDeactivate.filter(p => p.supermercado_marca === rBrandName && p.sucursal_id === rBranchId));
                }
                break;
              }

              const [brandName, branchId] = branchKey.split('_');
              const safeBrandName = brandName.replace(/[^a-z0-9]/gi, '').toLowerCase();
              const collectionPath = `supermercados/${safeBrandName}/sucursales/${branchId}/productos`;

              const toAddForBranch = overflowProductsToAdd.filter(p => p.supermercado_marca === brandName && p.sucursal_id === branchId);
              const toUpdateForBranch = overflowProductsToUpdate.filter(p => p.supermercado_marca === brandName && p.sucursal_id === branchId);
              const toDeactivateForBranch = overflowProductsToDeactivate.filter(p => p.supermercado_marca === brandName && p.sucursal_id === branchId);

              if (toAddForBranch.length > 0) {
                const result = await uploadBatchToFirestore(collectionPath, toAddForBranch, 'id', 'set', totalFirestoreOperations);
                overflowData.productos.toAdd.push(...result.failedDocuments, ...result.remainingDocuments);
                if (result.uploadStopped) throw new Error('Carga de desbordamiento de productos (añadir) detenida por error o límite.');
              }
              if (totalFirestoreOperations.currentCount >= FIRESTORE_WRITE_LIMIT) continue;

              if (toUpdateForBranch.length > 0) {
                const result = await uploadBatchToFirestore(collectionPath, toUpdateForBranch, 'id', 'update', totalFirestoreOperations);
                overflowData.productos.toUpdate.push(...result.failedDocuments, ...result.remainingDocuments);
                if (result.uploadStopped) throw new Error('Carga de desbordamiento de productos (actualizar) detenida por error o límite.');
              }
              if (totalFirestoreOperations.currentCount >= FIRESTORE_WRITE_LIMIT) continue;

              if (toDeactivateForBranch.length > 0) {
                const result = await uploadBatchToFirestore(collectionPath, toDeactivateForBranch, 'id', 'update', totalFirestoreOperations);
                overflowData.productos.toDeactivate.push(...result.failedDocuments, ...result.remainingDocuments);
                if (result.uploadStopped) throw new Error('Carga de desbordamiento de productos (desactivar) detenida por error o límite.');
              }
            }
          }
          console.log('Subida de datos de desbordamiento completada.');

          // Escribir el archivo de desbordamiento actualizado
          await writeToJson(overflowData, FIRESTORE_OVERFLOW_FILE);
          if (overflowData.sucursales.toAdd.length > 0 || overflowData.sucursales.toUpdate.length > 0 ||
            overflowData.productos.toAdd.length > 0 || overflowData.productos.toUpdate.length > 0 || overflowData.productos.toDeactivate.length > 0) {
            console.log(`Se guardaron ${overflowData.sucursales.toAdd.length + overflowData.sucursales.toUpdate.length + overflowData.productos.toAdd.length + overflowData.productos.toUpdate.length + overflowData.productos.toDeactivate.length} elementos restantes en el archivo de desbordamiento.`);
          } else {
            console.log('Archivo de desbordamiento vaciado ya que todos los datos fueron subidos.');
          }

          // Si se procesó el desbordamiento y se alcanzó el límite, finalizar la ejecución.
          if (totalFirestoreOperations.currentCount >= FIRESTORE_WRITE_LIMIT) {
            console.log(`Límite de operaciones alcanzado (${totalFirestoreOperations.currentCount}/${FIRESTORE_WRITE_LIMIT}) después de procesar el desbordamiento. El script finalizará. Los datos restantes se guardaron para la próxima ejecución.`);
            process.exit(0);
          }
        } else {
          console.log('No se encontraron datos en el archivo de desbordamiento o estaba vacío. Continuando con el proceso normal.');
          await writeToJson({}, FIRESTORE_OVERFLOW_FILE); // Asegurarse de que el archivo esté vacío
        }
      } catch (error) {
        console.error(`Error al procesar el archivo de desbordamiento (${FIRESTORE_OVERFLOW_FILE}):`, error.message);
        // Si hay un error al leer/procesar el archivo de desbordamiento, no se detiene el script, se procede con la lógica normal.
      }
    } else {
      console.log('No se encontró el archivo de desbordamiento. Continuando con el proceso normal.');
    }

    // --- Paso 2: Descargar y procesar los datos del día actual ---
    const today = new Date();
    const dayOfWeek = today.getDay();
    const currentDayZipUrl = DAILY_URLS[dayOfWeek];

    if (!currentDayZipUrl) {
      throw new Error(`No se encontró URL de descarga para el día de la semana actual (${dayOfWeek}). Por favor, verifica la constante DAILY_URLS.`);
    }

    console.log(`Intentando descargar ZIP desde: ${currentDayZipUrl}`);
    const bufferZip = await downloadZipWithRetries(currentDayZipUrl, tempZipPath, 3, 5000);

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
    console.log(`    Sucursales: Añadir: ${sucursalesFirestoreChanges.toAdd.length}, Actualizar: ${sucursalesFirestoreChanges.toUpdate.length}`);
    console.log(`    Productos: Añadir: ${productsFirestoreChanges.toAdd.length}, Actualizar: ${productsFirestoreChanges.toUpdate.length}, Desactivar: ${productsFirestoreChanges.toDeactivate.length}`);

    console.log('\n--- Escribiendo archivos JSON locales: Productos (sobrescribir), Sucursales (mantener existentes) ---');
    await writeFinalJsons(allProductsByBranch);
    console.log('Archivos JSON locales actualizados completamente (productos sobrescritos, sucursales mantenidas).');

    // --- Subir SOLO los CAMBIOS a Firestore (respetando la cuota) ---
    // Reiniciar overflowData para capturar lo que *realmente* no se sube AHORA (nuevos datos del ZIP)
    overflowData = {
      sucursales: { toAdd: [], toUpdate: [] },
      productos: { toAdd: [], toUpdate: [], toDeactivate: [] }
    };

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
        console.log(`    > Añadiendo ${sucursalesToAddForBrand.length} sucursales nuevas para ${brandName}...`);
        const { failedDocuments, remainingDocuments } = await uploadBatchToFirestore(collectionPath, sucursalesToAddForBrand, 'id_sucursal', 'set', totalFirestoreOperations);
        overflowData.sucursales.toAdd.push(...failedDocuments, ...remainingDocuments);
      }
      if (totalFirestoreOperations.currentCount >= FIRESTORE_WRITE_LIMIT) break;

      if (sucursalesToUpdateForBrand.length > 0) {
        console.log(`    > Actualizando ${sucursalesToUpdateForBrand.length} sucursales existentes para ${brandName}...`);
        const { failedDocuments, remainingDocuments } = await uploadBatchToFirestore(collectionPath, sucursalesToUpdateForBrand, 'id_sucursal', 'update', totalFirestoreOperations);
        overflowData.sucursales.toUpdate.push(...failedDocuments, ...remainingDocuments);
      }
      if (totalFirestoreOperations.currentCount >= FIRESTORE_WRITE_LIMIT) break;
    }
    console.log('Subida de sucursales a Firestore finalizada.');

    if (totalFirestoreOperations.currentCount >= FIRESTORE_WRITE_LIMIT) {
      console.log(`Límite de operaciones alcanzado (${totalFirestoreOperations.currentCount}/${FIRESTORE_WRITE_LIMIT}). No se subirán más datos en esta ejecución.`);
      await writeToJson(overflowData, FIRESTORE_OVERFLOW_FILE);
      process.exit(0);
    }

    console.log('\n--- Subiendo CAMBIOS de productos a Firestore ---');
    const allProductsForFirestore = [...productsFirestoreChanges.toAdd, ...productsFirestoreChanges.toUpdate, ...productsFirestoreChanges.toDeactivate];
    const uniqueProductBranches = new Set(allProductsForFirestore.map(p => `${p.supermercado_marca}_${p.sucursal_id}`));

    for (const branchKey of uniqueProductBranches) {
      if (totalFirestoreOperations.currentCount >= FIRESTORE_WRITE_LIMIT) {
        console.log(`Límite de operaciones alcanzado (${totalFirestoreOperations.currentCount}/${FIRESTORE_WRITE_LIMIT}). No se subirán más productos en esta ejecución.`);
        // Capturar el resto de los productos que no se pudieron procesar
        const remainingBranchesKeys = Array.from(uniqueProductBranches).slice(Array.from(uniqueProductBranches).indexOf(branchKey));
        for (const rKey of remainingBranchesKeys) {
          const [rBrandName, rBranchId] = rKey.split('_');
          overflowData.productos.toAdd.push(...productsFirestoreChanges.toAdd.filter(p => p.supermercado_marca === rBrandName && p.sucursal_id === rBranchId));
          overflowData.productos.toUpdate.push(...productsFirestoreChanges.toUpdate.filter(p => p.supermercado_marca === rBrandName && p.sucursal_id === rBranchId));
          overflowData.productos.toDeactivate.push(...productsFirestoreChanges.toDeactivate.filter(p => p.supermercado_marca === rBrandName && p.sucursal_id === rBranchId));
        }
        break;
      }

      const [brandName, branchId] = branchKey.split('_');
      const safeBrandName = brandName.replace(/[^a-z0-9]/gi, '').toLowerCase();
      const collectionPath = `supermercados/${safeBrandName}/sucursales/${branchId}/productos`;

      const productsToAddForBranch = productsFirestoreChanges.toAdd.filter(p => p.supermercado_marca === brandName && p.sucursal_id === branchId);
      const productsToUpdateForBranch = productsFirestoreChanges.toUpdate.filter(p => p.supermercado_marca === brandName && p.sucursal_id === branchId);
      const productsToDeactivateForBranch = productsFirestoreChanges.toDeactivate.filter(p => p.supermercado_marca === brandName && p.sucursal_id === branchId);

      if (productsToAddForBranch.length > 0) {
        console.log(`    > Añadiendo ${productsToAddForBranch.length} productos nuevos para ${brandName}/${branchId}...`);
        const { failedDocuments, remainingDocuments } = await uploadBatchToFirestore(collectionPath, productsToAddForBranch, 'id', 'set', totalFirestoreOperations);
        overflowData.productos.toAdd.push(...failedDocuments, ...remainingDocuments);
      }
      if (totalFirestoreOperations.currentCount >= FIRESTORE_WRITE_LIMIT) continue;

      if (productsToUpdateForBranch.length > 0) {
        console.log(`    > Actualizando ${productsToUpdateForBranch.length} productos para ${brandName}/${branchId}...`);
        const { failedDocuments, remainingDocuments } = await uploadBatchToFirestore(collectionPath, productsToUpdateForBranch, 'id', 'update', totalFirestoreOperations);
        overflowData.productos.toUpdate.push(...failedDocuments, ...remainingDocuments);
      }
      if (totalFirestoreOperations.currentCount >= FIRESTORE_WRITE_LIMIT) continue;

      if (productsToDeactivateForBranch.length > 0) {
        console.log(`    > Desactivando ${productsToDeactivateForBranch.length} productos para ${brandName}/${branchId}...`);
        const { failedDocuments, remainingDocuments } = await uploadBatchToFirestore(collectionPath, productsToDeactivateForBranch, 'id', 'update', totalFirestoreOperations);
        overflowData.productos.toDeactivate.push(...failedDocuments, ...remainingDocuments);
      }
    }
    console.log('Subida de productos a Firestore finalizada.');

    // Guardar cualquier dato restante en el archivo de desbordamiento
    await writeToJson(overflowData, FIRESTORE_OVERFLOW_FILE);
    if (overflowData.sucursales.toAdd.length > 0 || overflowData.sucursales.toUpdate.length > 0 ||
      overflowData.productos.toAdd.length > 0 || overflowData.productos.toUpdate.length > 0 || overflowData.productos.toDeactivate.length > 0) {
      console.log(`Se guardaron ${overflowData.sucursales.toAdd.length + overflowData.sucursales.toUpdate.length + overflowData.productos.toAdd.length + overflowData.productos.toUpdate.length + overflowData.productos.toDeactivate.length} elementos restantes en el archivo de desbordamiento para la próxima ejecución.`);
    } else {
      console.log('No quedan elementos pendientes de subir. El archivo de desbordamiento está vacío.');
    }

    if (totalFirestoreOperations.currentCount >= FIRESTORE_WRITE_LIMIT) {
      console.log('\nEl proceso finalizó porque se alcanzó el límite de operaciones de Firestore.');
      process.exit(0);
    } else {
      console.log('\nProceso completado exitosamente. Todos los datos de interés fueron procesados y subidos a Firestore.');
      process.exit(0);
    }

  } catch (error) {
    console.error('\nError crítico en el proceso general:', error);
    // En caso de error crítico, también intentar guardar lo que quede para el overflow
    await writeToJson(overflowData, FIRESTORE_OVERFLOW_FILE);
    console.log('Se intentó guardar cualquier dato pendiente en el archivo de desbordamiento debido a un error crítico.');
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

// Ejecutar el proceso principal
generarJsonFiltradosYSubirAFirestore();