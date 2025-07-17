require('dotenv').config();
const unzipper = require('unzipper');
const csv = require('csv-parser');
const fetch = require('node-fetch');
const stream = require('stream');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises'); // Usamos 'fs/promises' para operaciones asíncronas
const admin = require('firebase-admin');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
if (!serviceAccountPath) {
  console.error('Error: FIREBASE_SERVICE_ACCOUNT_PATH no está definido en el archivo .env');
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = require(path.resolve(serviceAccountPath));
} catch (error) {
  console.error(`Error al cargar el archivo de cuenta de servicio de Firebase desde ${serviceAccountPath}:`, error);
  process.exit(1);
}

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
  5: 'https://datos.produccion.gob.ar/dataset/6f47ec76-d1ce-4e34-a7e1-85ec-4a8467aad27e/download/sepa_viernes.zip', // URL Corregida
  6: 'https://datos.produccion.gob.ar/dataset/6f47ec76-d1ce-4e34-a7e1-621fe9b1d0b5/resource/b3c3da5d-213d-41e7-8d74-f23fda0a3c30/download/sepa_sabado.zip',
};


const TEMP_DATA_DIR = path.join(__dirname, '../src/data/temp_processing');
const tempZipPath = path.join(TEMP_DATA_DIR, 'temp_sepa.zip');

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
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Error al descargar el archivo ZIP: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  await fsp.writeFile(outputPath, buffer);
  console.log(`ZIP del día descargado en ${outputPath}.`);
  return buffer;
}

// writeToJson se mantiene para escribir los JSONs finales
async function writeToJson(data, filename) {
  if (!data || (Array.isArray(data) && data.length === 0)) {
    console.log(`No hay datos para escribir en ${filename}. El archivo estará vacío o no se creará.`);
    // Asegurarse de que el directorio existe incluso si no hay datos.
    const dir = path.dirname(filename);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(filename, JSON.stringify([], null, 2), 'utf8'); // Escribir un array vacío
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
      'id_sucursal': ['id_sucursal', '0', '1', '2'],
      'comercio_cuit': ['comercio_cuit', 'cuit'],
      'comercio_razon_social': ['comercio_razon_social', 'razon_social', 'razon social'],
      'sucursales_latitud': ['sucursales_latitud', 'latitud'],
      'sucursales_longitud': ['sucursales_longitud', 'longitud'],
      'productos_descripcion': ['productos_descripcion', 'descripcion'],
      'productos_precio_lista': ['productos_precio_lista', 'precio_lista'],
      'productos_ean': ['productos_ean', 'ean'],
      'productos_marca': ['productos_marca', 'marca'],
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
          const potentialDelimiters = [',', ';', '|'];
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

          if (maxMatches === -1 && firstLine.length > 0) {
            if (firstLine.includes('|')) {
              detectedDelimiter = '|';
            } else if (firstLine.includes(';')) {
              detectedDelimiter = ';';
            } else {
              detectedDelimiter = ',';
            }
            console.warn(`[WARN] No se pudieron encontrar encabezados esperados para ${filenameForLog}. Intentando inferir delimitador basado en caracteres: '${detectedDelimiter}'`);
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
            console.warn(`[WARN] El archivo ${filenameForLog} es muy pequeño para una detección robusta. Intentando con delimitador por defecto (',').`);
            const firstLine = buffer.split('\n')[0];
            let finalFallbackDelimiter = ',';
            if (firstLine.includes('|')) finalFallbackDelimiter = '|';
            else if (firstLine.includes(';')) finalFallbackDelimiter = ';';

            parser = csv({
              separator: finalFallbackDelimiter,
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

function normalizeSupermarketBrand(detectedBrand) {
  return detectedBrand;
}

// --- Funciones auxiliares para procesarZipInterno (Aquí van las nuevas/faltantes) ---

function findMatchingBranch(branch, targetLocations) {
  for (const target of targetLocations) {
    if (getDistance(parseFloat(branch.sucursales_latitud), parseFloat(branch.sucursales_longitud), target.lat, target.lon) < DISTANCE_THRESHOLD) {
      const normalizedBranchName = branch.sucursal_nombre ? branch.sucursal_nombre.toLowerCase() : '';
      const normalizedTargetName = target.name ? target.name.toLowerCase() : '';

      if (normalizedBranchName.includes(normalizedTargetName.split(' ')[0].toLowerCase()) ||
        normalizedTargetName.includes(normalizedBranchName.split(' ')[0].toLowerCase())) {
        return target;
      }
      return target; // Si la distancia es muy cercana, igual la consideramos
    }
  }
  return null;
}

function normalizeProductData(product, brand, branchId) {
  if (!product.productos_descripcion || !product.productos_precio_lista || !product.productos_ean) {
    return null;
  }

  const productId = `${product.productos_ean}_${brand.replace(/[^a-z0-9]/gi, '').toLowerCase()}_${branchId}`;

  return {
    id: productId, // ID único para Firestore
    ean: product.productos_ean,
    nombre: product.productos_descripcion,
    marca_producto: product.productos_marca || 'N/A',
    precio: parseFloat(product.productos_precio_lista.replace(',', '.')) || 0,
    cantidad_presentacion: product.productos_cantidad_presentacion || '',
    unidad_medida_presentacion: product.productos_unidad_medida_presentacion || '',
    supermercado_marca: brand, // Marca normalizada del supermercado
    sucursal_id: branchId, // ID de la sucursal
    stock: true, // Asumimos que si está en el archivo, hay stock
    ultima_actualizacion: Timestamp.now()
  };
}

function normalizeBranchData(branch, brand, matchedTarget) {
  return {
    id_sucursal: matchedTarget.id_sucursal, // Usar el ID de la sucursal de tu lista fija
    comercio_id: String(branch.id_comercio || ''), // Asegurar que sea string
    comercio_cuit: String(branch.comercio_cuit || ''),
    comercio_razon_social: branch.comercio_razon_social || '',
    nombre_sucursal: branch.sucursal_nombre || '',
    direccion_sucursal: branch.sucursal_direccion || '',
    provincia: branch.sucursales_provincia || '',
    localidad: branch.sucursales_localidad || '',
    latitud: parseFloat(branch.sucursales_latitud),
    longitud: parseFloat(branch.sucursales_longitud),
    marca: brand, // Marca normalizada
    ultima_actualizacion: Timestamp.now()
  };
}

async function procesarZipInterno(bufferZipInterno, allFilteredSucursalesByBrand, allProductsByBranch, zipFileName) {
  const innerDirectory = await unzipper.Open.buffer(bufferZipInterno);

  for (const innerFile of innerDirectory.files) {
    if (innerFile.path.toLowerCase().endsWith('.csv')) {
      console.log(`    Procesando CSV: ${innerFile.path}`);
      const csvStream = innerFile.stream();
      const docs = await procesarCsvStream(csvStream, innerFile.path);

      if (docs.length === 0) {
        console.warn(`    [WARN] El archivo CSV ${innerFile.path} está vacío o no contiene datos válidos.`);
        continue;
      }

      // Determinar si es un archivo de sucursales o productos basado en los encabezados
      const firstDoc = docs[0];
      const isProductFile = firstDoc.hasOwnProperty('productos_ean') && firstDoc.hasOwnProperty('productos_descripcion');
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
              allFilteredSucursalesByBrand.get(foundBrand).set(normalizedSucursal.id_sucursal, normalizedSucursal);
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


// Función auxiliar para cargar datos JSON locales
// isProduct es true para src/data/products (estructura anidada por marca/sucursal)
async function loadLocalJsonData(basePath, isProduct = false) {
  const dataMap = new Map(); // Para sucursales: Map<id_sucursal, data>, para productos: Map<marca, Map<id_sucursal, Map<id_product, data>>>

  if (!fs.existsSync(basePath)) {
    console.log(`No se encontró el directorio local: ${basePath}. Se asumirá que no hay datos locales existentes.`);
    return isProduct ? new Map() : new Map();
  }

  const brandDirs = await fsp.readdir(basePath, { withFileTypes: true });

  if (isProduct) {
    for (const brandDirEntry of brandDirs) {
      if (brandDirEntry.isDirectory()) {
        const brandName = brandDirEntry.name;
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
  } else { // Para sucursales
    for (const fileEntry of brandDirs) {
      if (fileEntry.isFile() && fileEntry.name.endsWith('.json')) {
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

// Función para guardar los datos recién procesados en el directorio temporal
async function saveTempJsons(newSucursalesByBrand, newProductsByBranch) {
  await fsp.mkdir(TEMP_DATA_DIR, { recursive: true });

  // Guardar sucursales temporales
  const tempSuperDir = path.join(TEMP_DATA_DIR, 'super');
  await fsp.mkdir(tempSuperDir, { recursive: true });
  for (const [brandName, sucursalesMap] of newSucursalesByBrand.entries()) {
    const safeBrandName = brandName.replace(/[^a-z0-9]/gi, '').toLowerCase();
    await fsp.writeFile(path.join(tempSuperDir, `${safeBrandName}.json`), JSON.stringify(Array.from(sucursalesMap.values()), null, 2), 'utf8');
  }

  // Guardar productos temporales
  const tempProductsDir = path.join(TEMP_DATA_DIR, 'products');
  await fsp.mkdir(tempProductsDir, { recursive: true });
  for (const [brandName, branchesMap] of newProductsByBranch.entries()) {
    const safeBrandName = brandName.replace(/[^a-z0-9]/gi, '').toLowerCase();
    const brandDir = path.join(tempProductsDir, safeBrandName);
    await fsp.mkdir(brandDir, { recursive: true });
    for (const [branchId, productsList] of branchesMap.entries()) {
      await fsp.writeFile(path.join(brandDir, `${branchId}.json`), JSON.stringify(productsList, null, 2), 'utf8');
    }
  }
  console.log(`Datos recién procesados guardados temporalmente en ${TEMP_DATA_DIR}`);
}

// Función para eliminar los archivos temporales
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
            // Si llegamos aquí, algo salió mal y no es un ENOENT.
            // Podríamos incluso intentar un unlink de los archivos específicos si el directorio no se borra.
        }
    }
}

// Función central de comparación y preparación del estado final y cambios para Firestore
async function compareDataAndPrepareFinalState(
  newSucursalesByBrand, newProductsByBranch,
  existingLocalSucursales, existingLocalProducts
) {
  const currentTimestamp = Timestamp.now();

  // --- Comparación y preparación para SUCURSALES ---
  const sucursalesToAdd = [];
  const sucursalesToUpdate = [];
  const finalLocalSucursalesMap = new Map(); // Este mapa representará el estado FINAL de las sucursales locales

  // 1. Añadir todas las sucursales existentes localmente al mapa final primero
  for (const [id, data] of existingLocalSucursales.entries()) {
    finalLocalSucursalesMap.set(id, { ...data }); // Copia para evitar mutación directa
  }

  // 2. Procesar las nuevas sucursales (del ZIP de hoy)
  for (const [brandName, sucursalesMap] of newSucursalesByBrand.entries()) {
    for (const [id, newSucursalData] of sucursalesMap.entries()) {
      const existingSucursalData = finalLocalSucursalesMap.get(id);

      // Asegurar que el timestamp de ultima_actualizacion se establece para las nuevas sucursales
      newSucursalData.ultima_actualizacion = currentTimestamp;

      if (!existingSucursalData) {
        // Nueva sucursal
        sucursalesToAdd.push(newSucursalData);
        finalLocalSucursalesMap.set(id, newSucursalData); // Añadir al mapa final
      } else {
        // Comparar sucursal existente con la nueva
        const isModified = existingSucursalData.nombre_sucursal !== newSucursalData.nombre_sucursal ||
          existingSucursalData.direccion_sucursal !== newSucursalData.direccion_sucursal ||
          existingSucursalData.latitud !== newSucursalData.latitud ||
          existingSucursalData.longitud !== newSucursalData.longitud ||
          existingSucursalData.comercio_razon_social !== newSucursalData.comercio_razon_social ||
          existingSucursalData.provincia !== newSucursalData.provincia ||
          existingSucursalData.localidad !== newSucursalData.localidad;
        // Puedes añadir más campos a comparar aquí

        if (isModified) {
          sucursalesToUpdate.push(newSucursalData); // Para Firestore, se actualiza el documento completo
          finalLocalSucursalesMap.set(id, newSucursalData); // Actualizar en el mapa final
        } else {
          // Si no hay cambios, simplemente mantener el existente o el nuevo (con el timestamp actualizado)
          // Ya está en finalLocalSucursalesMap si era existente.
          // Para que el JSON local siempre tenga el timestamp de la última ejecución, actualizamos el existente.
          finalLocalSucursalesMap.set(id, { ...existingSucursalData, ultima_actualizacion: currentTimestamp });
        }
      }
    }
  }
  // NOTA: Para sucursales, no hay `sucursalesToDeactivate` ni `sucursalesToDelete`
  // Si una sucursal existente no está en el ZIP de hoy, se mantiene en 'finalLocalSucursalesMap'.

  // --- Comparación y preparación para PRODUCTOS ---
  const productsToAdd = [];
  const productsToUpdate = [];
  const productsToDeactivate = [];
  const finalLocalProductsMap = new Map(); // Map<marca, Map<id_sucursal, Map<id_product, data>>>

  // Iniciar finalLocalProductsMap con los productos existentes locales
  for (const [brandName, branchesMap] of existingLocalProducts.entries()) {
    const brandProductsMap = new Map();
    for (const [branchId, productsMap] of branchesMap.entries()) {
      const branchProductsMap = new Map();
      for (const [productId, productData] of productsMap.entries()) {
        branchProductsMap.set(productId, { ...productData }); // Copia
      }
      brandProductsMap.set(branchId, branchProductsMap);
    }
    finalLocalProductsMap.set(brandName, brandProductsMap);
  }

  // Procesar los nuevos productos (del ZIP de hoy)
  for (const [brandName, newBranchesMap] of newProductsByBranch.entries()) {
    if (!finalLocalProductsMap.has(brandName)) {
      finalLocalProductsMap.set(brandName, new Map());
    }
    const currentBrandProductsMap = finalLocalProductsMap.get(brandName);

    for (const [branchId, newProductsList] of newBranchesMap.entries()) {
      if (!currentBrandProductsMap.has(branchId)) {
        currentBrandProductsMap.set(branchId, new Map());
      }
      const currentBranchProductsMap = currentBrandProductsMap.get(branchId);

      const newProductsInBranchMap = new Map(); // Para saber rápidamente qué productos nuevos llegaron en esta sucursal
      newProductsList.forEach(p => newProductsInBranchMap.set(p.id, p));

      for (const [id, newProductData] of newProductsInBranchMap.entries()) {
        const existingProductData = currentBranchProductsMap.get(id);
        newProductData.ultima_actualizacion = currentTimestamp;

        if (!existingProductData) {
          // Nuevo producto
          productsToAdd.push(newProductData);
          currentBranchProductsMap.set(id, newProductData); // Añadir al mapa final
        } else {
          // Producto existente, comparar
          const isModified = existingProductData.precio !== newProductData.precio ||
            existingProductData.stock !== newProductData.stock ||
            existingProductData.nombre !== newProductData.nombre ||
            existingProductData.ean !== newProductData.ean ||
            existingProductData.marca_producto !== newProductData.marca_producto ||
            existingProductData.cantidad_presentacion !== newProductData.cantidad_presentacion ||
            existingProductData.unidad_medida_presentacion !== newProductData.unidad_medida_presentacion;
          // Puedes añadir más campos relevantes aquí para la comparación

          if (isModified) {
            productsToUpdate.push(newProductData); // Para Firestore
            currentBranchProductsMap.set(id, newProductData); // Actualizar en el mapa final
          } else {
            // Si no hay cambios, simplemente asegurar que el timestamp se actualice en el JSON final
            currentBranchProductsMap.set(id, { ...existingProductData, ultima_actualizacion: currentTimestamp });
          }
        }
      }

      // Detectar productos a desactivar: aquellos que estaban en existingLocalProducts
      // para esta sucursal, pero no están en newProductsInBranchMap
      for (const [id, existingProductData] of currentBranchProductsMap.entries()) {
        if (!newProductsInBranchMap.has(id)) {
          if (existingProductData.stock !== false) { // Solo desactivar si no está ya desactivado
            const deactivatedProductData = {
              ...existingProductData,
              stock: false,
              ultima_actualizacion: currentTimestamp
            };
            productsToDeactivate.push(deactivatedProductData); // Para Firestore
            currentBranchProductsMap.set(id, deactivatedProductData); // Actualizar en el mapa final
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
    },
    finalLocalSucursalesMap,
    finalLocalProductsMap
  };
}


// Función para escribir los JSONs finales después de la comparación
async function writeFinalJsons(finalLocalSucursalesMap, finalLocalProductsMap) {
  const baseSuperDir = path.join(__dirname, '../src/data/super');
  await fsp.mkdir(baseSuperDir, { recursive: true });

  console.log(`Escribiendo archivos JSON de sucursales (uno por marca) en '${baseSuperDir}'...`);
  // Limpiar directorios antes de escribir
  const existingSuperFiles = await fsp.readdir(baseSuperDir);
  for (const file of existingSuperFiles) {
    if (file.endsWith('.json')) {
      await fsp.unlink(path.join(baseSuperDir, file));
    }
  }

  const sucursalesByBrandForWriting = new Map();
  for (const [id, sucursalData] of finalLocalSucursalesMap.entries()) {
    const brand = sucursalData.marca;
    if (!sucursalesByBrandForWriting.has(brand)) {
      sucursalesByBrandForWriting.set(brand, []);
    }
    sucursalesByBrandForWriting.get(brand).push(sucursalData);
  }

  let totalUniqueSucursalesWritten = 0;
  for (const [brandName, sucursalesList] of sucursalesByBrandForWriting.entries()) {
    if (MARCAS_NORMALIZADAS_INTERES.has(brandName)) {
      const safeBrandName = brandName.replace(/[^a-z0-9]/gi, '').toLowerCase();
      const branchFilename = path.join(baseSuperDir, `${safeBrandName}.json`);
      await writeToJson(sucursalesList, branchFilename);
      totalUniqueSucursalesWritten += sucursalesList.length;
    }
  }
  console.log(`Total de sucursales únicas escritas en JSON: ${totalUniqueSucursalesWritten}`);


  const baseProductsDir = path.join(__dirname, '../src/data/products');
  await fsp.mkdir(baseProductsDir, { recursive: true });

  console.log(`Escribiendo archivos JSON de productos (por marca y sucursal) en '${baseProductsDir}'...`);
  // Limpiar directorios de productos (marca/archivos.json)
  const existingProductBrands = await fsp.readdir(baseProductsDir, { withFileTypes: true });
  for (const brandDirEntry of existingProductBrands) {
    if (brandDirEntry.isDirectory()) {
      await fsp.rm(path.join(baseProductsDir, brandDirEntry.name), { recursive: true, force: true });
    }
  }

  let totalProductsFilesWritten = 0;
  for (const [brandName, branchesMap] of finalLocalProductsMap.entries()) {
    if (MARCAS_NORMALIZADAS_INTERES.has(brandName)) {
      const safeBrandName = brandName.replace(/[^a-z0-9]/gi, '').toLowerCase();
      const brandDir = path.join(baseProductsDir, safeBrandName);
      await fsp.mkdir(brandDir, { recursive: true });
      console.log(`     Creando directorio para marca: ${brandName}`);

      for (const [branchId, productsMap] of branchesMap.entries()) {
        const productFilename = path.join(brandDir, `${branchId}.json`);
        await writeToJson(Array.from(productsMap.values()), productFilename);
        totalProductsFilesWritten++;
      }
    }
  }
  console.log(`Generación de JSONs finales completada. Total de archivos de productos escritos: ${totalProductsFilesWritten}.`);
}


// uploadBatchToFirestore MODIFICADA: Ahora solo ejecuta la operación pasada, sin lógica de lectura/comparación
async function uploadBatchToFirestore(collectionName, documents, idField, operationType = 'set') {
  const BATCH_SIZE = 400;
  const COMMIT_TIMEOUT_MS = 60 * 1000;

  let batch = db.batch();
  let batchCount = 0;
  let uploadedCount = 0;
  let failedDocuments = [];
  let uploadStoppedDueToError = false;

  console.log(`Iniciando subida por lotes a la colección '${collectionName}' para operación '${operationType}'. Total de documentos: ${documents.length}`);

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
      uploadStoppedDueToError = true; // Considerar esto un error grave que detiene el batching
      break; // Salir del loop de preparación del batch
    }


    if (batchCount === BATCH_SIZE || i === documents.length - 1) {
      try {
        await Promise.race([
          batch.commit(),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout al commitear batch (${operationType}) a '${collectionName}'`)), COMMIT_TIMEOUT_MS))
        ]);
        uploadedCount += batchCount;
        console.log(`    Lote de ${batchCount} documentos (${operationType}) subido a '${collectionName}'. Total subidos: ${uploadedCount}`);
        batch = db.batch();
        batchCount = 0;
        await new Promise(resolve => setTimeout(resolve, 200)); // Pequeña pausa
      } catch (error) {
        console.error(`ERROR AL SUBIR LOTE (${operationType}) a la colección '${collectionName}'. Deteniendo la subida para esta colección.`, error);
        uploadStoppedDueToError = true;
        // Añadir los documentos restantes a failedDocuments si no se subieron
        for (let j = i - batchCount + 1; j < documents.length; j++) {
          failedDocuments.push(documents[j]);
        }
        batch = db.batch(); // Limpiar el batch actual
        batchCount = 0;
        break; // Salir del loop principal
      }
    }
  }

  if (batchCount > 0 && !uploadStoppedDueToError) { // Intenta commitear cualquier documento restante
    try {
      await Promise.race([
        batch.commit(),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout al commitear lote final (${operationType}) en '${collectionName}'`)), COMMIT_TIMEOUT_MS))
      ]);
      uploadedCount += batchCount;
      console.log(`    Lote final de ${batchCount} documentos (${operationType}) subido a '${collectionName}'. Total subidos: ${uploadedCount}`);
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
  let allSucursalesForBackup = []; // No se usarán para el flujo principal de JSON, solo para backup de emergencia
  let allProductsForBackup = []; // No se usarán para el flujo principal de JSON, solo para backup de emergencia

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
console.log(`Intentando descargar ZIP a: ${tempZipPath}`);
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

    const allFilteredSucursalesByBrand = new Map(); // Datos NUEVOS del ZIP de hoy
    const allProductsByBranch = new Map(); // Datos NUEVOS del ZIP de hoy

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

    // ----------------------------------------------------------------------
    // NUEVA LÓGICA DE COMPARACIÓN LOCAL Y SUBIDA SELECTIVA A FIRESTORE
    // ----------------------------------------------------------------------

    // 1. Cargar los datos LOCALES EXISTENTES (los del día anterior)
    console.log('\n--- Cargando datos locales existentes para comparación ---');
    const existingLocalSucursales = await loadLocalJsonData(path.join(__dirname, '../src/data/super'));
    const existingLocalProducts = await loadLocalJsonData(path.join(__dirname, '../src/data/products'), true);
    console.log(`Sucursales locales existentes: ${existingLocalSucursales.size}`);
    console.log(`Marcas de productos locales existentes: ${existingLocalProducts.size}`);


    // 2. Comparar los datos del ZIP con los locales y preparar los cambios y el estado final local
    console.log('\n--- Realizando comparación local y preparando cambios para Firestore ---');
    const {
      sucursalesFirestoreChanges,
      productsFirestoreChanges,
      finalLocalSucursalesMap,
      finalLocalProductsMap
    } = await compareDataAndPrepareFinalState(
      allFilteredSucursalesByBrand, allProductsByBranch,
      existingLocalSucursales, existingLocalProducts
    );

    console.log('Resumen de cambios para Firestore:');
    console.log(`  Sucursales: Añadir: ${sucursalesFirestoreChanges.toAdd.length}, Actualizar: ${sucursalesFirestoreChanges.toUpdate.length}`);
    console.log(`  Productos: Añadir: ${productsFirestoreChanges.toAdd.length}, Actualizar: ${productsFirestoreChanges.toUpdate.length}, Desactivar: ${productsFirestoreChanges.toDeactivate.length}`);

    // 3. Escribir los JSONs permanentes (resultado de la fusión y comparación)
    console.log('\n--- Escribiendo archivos JSON permanentes con el estado final ---');
    await writeFinalJsons(finalLocalSucursalesMap, finalLocalProductsMap);
    console.log('Archivos JSON permanentes actualizados.');


    // 4. Subir SOLO los CAMBIOS a Firestore
    let firestoreUploadFailed = false;

    // Subir cambios de SUCURSALES
    console.log('\n--- Subiendo CAMBIOS de sucursales a Firestore ---');
    const uniqueBrandsForSucursales = new Set([...sucursalesFirestoreChanges.toAdd, ...sucursalesFirestoreChanges.toUpdate].map(s => s.marca));

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

    // Subir cambios de PRODUCTOS
    console.log('\n--- Subiendo CAMBIOS de productos a Firestore ---');
    // Obtener todas las sucursales únicas de los cambios de productos
    const uniqueProductBranches = new Set();
    productsFirestoreChanges.toAdd.forEach(p => uniqueProductBranches.add(`${p.supermercado_marca}_${p.sucursal_id}`));
    productsFirestoreChanges.toUpdate.forEach(p => uniqueProductBranches.add(`${p.supermercado_marca}_${p.sucursal_id}`));
    productsFirestoreChanges.toDeactivate.forEach(p => uniqueProductBranches.add(`${p.supermercado_marca}_${p.sucursal_id}`));

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
        const { failedDocuments, uploadStopped } = await uploadBatchToFirestore(collectionPath, productsToDeactivateForBranch, 'id', 'update'); // Es un update para cambiar 'stock: false'
        if (failedDocuments.length > 0 || uploadStopped) firestoreUploadFailed = true;
      }
    }
    console.log('Subida de productos a Firestore finalizada.');

    // ----------------------------------------------------------------------
    // FIN DE LA NUEVA LÓGICA
    // ----------------------------------------------------------------------

    if (firestoreUploadFailed) {
      console.error('\nEl proceso finalizó con ALGUNOS ERRORES en la subida a Firestore. Revisa los logs anteriores para más detalles. Los datos incompletos se respaldaron localmente.');
      process.exit(1); // Sale con código de error si alguna subida falló
    } else {
      console.log('\nProceso completado exitosamente. Todos los datos de interés fueron procesados y subidos a Firestore.');
      process.exit(0);
    }

  } catch (error) {
    console.error('\nError crítico en el proceso general:', error);
    try {
      console.log('Intentando guardar datos procesados localmente debido a un error crítico (Backup de emergencia)...');
      const backupDir = path.join(__dirname, '../src/data/emergency_backup');
      await fsp.mkdir(backupDir, { recursive: true });

      console.log('La lógica de backup manual ya no es necesaria con el nuevo flujo de JSONs persistentes.');

    } catch (backupError) {
      console.error('Error al intentar guardar datos de backup de emergencia:', backupError);
    }
    process.exit(1);
  } finally {
        // Limpiar archivos temporales descargados y de procesamiento
        try {
            // La siguiente línea se encarga de eliminar el directorio TEMP_DATA_DIR completo
            // y todo su contenido, incluyendo 'temp_sepa.zip'.
            await cleanTempJsons();
        } catch (cleanupError) {
            // Si hay un error al limpiar (ej. permiso denegado, o si el directorio ya no existe
            // por alguna razón externa), lo registramos, excepto si es ENOENT (no existe),
            // que es normal si ya fue borrado.
            if (cleanupError.code !== 'ENOENT') {
                console.warn(`No se pudo completar la limpieza de archivos temporales:`, cleanupError);
            }
        }
    }
}

generarJsonFiltradosYSubirAFirestore();