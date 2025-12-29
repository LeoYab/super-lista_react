require('dotenv').config();
const unzipper = require('unzipper');
const csv = require('csv-parser');
const fetch = require('node-fetch');
const stream = require('stream');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const crypto = require('crypto');

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
  'sepa_2_comercio-sepa-10_', // Carrefour
  'sepa_2_comercio-sepa-11_', // Changomas
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadZipForDay(url, outputPath) {
  console.log(`Descargando ZIP para el día desde: ${url}`);
  try {
    const response = await fetch(url, { timeout: 60000 });

    if (!response.ok) {
      throw new Error(`Error HTTP al descargar el ZIP: ${response.statusText} (Status: ${response.status})`);
    }

    await pipeline(response.body, fs.createWriteStream(outputPath));

    const stats = await fsp.stat(outputPath);
    if (stats.size < 22) {
      throw new Error(`El archivo ZIP es muy pequeño (${stats.size} bytes) - posiblemente corrupto`);
    }

    console.log(`ZIP del día descargado en ${outputPath} (${stats.size} bytes).`);
    return outputPath;
  } catch (error) {
    console.error(`ERROR al descargar el ZIP de ${url}:`, error.message);
    throw error;
  }
}

async function downloadZipWithRetries(url, outputPath, maxRetries = 3, retryDelayMs = 5000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`Intentando descargar ZIP (Intento ${i + 1}/${maxRetries}) desde: ${url}`);
      await downloadZipForDay(url, outputPath);
      return outputPath;
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
  if (!data || (Array.isArray(data) && data.length === 0)) {
    console.log(`No hay datos para escribir en ${filename}. El archivo estará vacío o no se creará.`);
    const dir = path.dirname(filename);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(filename, JSON.stringify([], null, 2), 'utf8');
    return;
  }
  try {
    const dir = path.dirname(filename);
    await fsp.mkdir(dir, { recursive: true });
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

async function procesarCsvStream(streamCsv, callback, filenameForLog = 'CSV desconocido') {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.from([]);
    let delimiterDetected = false;
    let parser = null;

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
      'id_producto': ['id_producto', 'producto_id']
    };

    const passthrough = new stream.PassThrough();

    streamCsv.on('data', async (chunk) => {
      if (!delimiterDetected) {
        streamCsv.pause();
        buffer = Buffer.concat([buffer, chunk]);

        if (buffer.length < 5120 && !buffer.toString().includes('\n')) {
          streamCsv.resume();
          return;
        }

        const firstLine = buffer.toString().split('\n')[0];
        let detectedDelimiter = ',';
        let maxMatches = -1;
        const potentialDelimiters = [',', ';', '|', '\t'];
        const lowerCaseFirstLine = firstLine.toLowerCase();

        for (const delim of potentialDelimiters) {
          const headers = lowerCaseFirstLine.split(delim).map(h => h.trim());
          let currentMatches = 0;
          for (const key in commonColumnMaps) {
            if (commonColumnMaps[key].some(colName => headers.includes(colName))) currentMatches++;
          }
          if (headers.length > 1 && currentMatches > maxMatches) {
            maxMatches = currentMatches;
            detectedDelimiter = delim;
          }
        }

        console.log(`[CSV] Delimitador detectado para ${filenameForLog}: '${detectedDelimiter}'`);

        parser = csv({
          separator: detectedDelimiter,
          strict: false,
          mapHeaders: ({ header, index }) => {
            const cleanHeader = header.replace(/^[^a-zA-Z0-9]+/, '');
            const normalizedHeader = cleanHeader.toLowerCase().trim();
            for (const key in commonColumnMaps) {
              if (commonColumnMaps[key].includes(normalizedHeader)) return key;
            }
            return normalizedHeader || `col_${index}`;
          },
          mapValues: ({ header, index, value }) => value.trim()
        });

        delimiterDetected = true;
        passthrough.pipe(parser);

        (async () => {
          try {
            for await (const row of parser) {
              await callback(row);
            }
            resolve();
          } catch (err) {
            reject(err);
          }
        })();

        passthrough.write(buffer);
        buffer = Buffer.from([]);
        streamCsv.resume();
      } else {
        if (!passthrough.write(chunk)) {
          streamCsv.pause();
          passthrough.once('drain', () => streamCsv.resume());
        }
      }
    });

    streamCsv.on('end', () => {
      passthrough.end();
      if (!delimiterDetected) resolve();
    });

    streamCsv.on('error', reject);
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
  // Validación mejorada de campos requeridos
  const descripcion = product.productos_descripcion?.trim();
  if (!descripcion || !product.productos_precio_lista) {
    return null;
  }

  // Validación y parseo de precio mejorado
  let precio = parseFloat(String(product.productos_precio_lista).replace(',', '.'));
  if (isNaN(precio) || precio <= 0) {
    console.warn(`Precio inválido o cero para producto '${descripcion}' (precio: '${product.productos_precio_lista}'). Saltando.`);
    return null;
  }

  const sanitizedEan = String(product.productos_ean || '').replace(/\D/g, '');

  let uniqueIdentifier;
  if (product.id_producto && String(product.id_producto).trim() !== '' && String(product.id_producto).trim() !== '0') {
    uniqueIdentifier = String(product.id_producto).trim();
  } else if (sanitizedEan && sanitizedEan !== '0') {
    uniqueIdentifier = sanitizedEan;
  } else {
    // CORREGIDO: Sin timestamp ni random para IDs consistentes
    const fallbackSource = `${descripcion}-${product.productos_marca || 'NOMARCA'}-${product.productos_cantidad_presentacion || 'NOQTY'}-${product.productos_unidad_medida_presentacion || 'NOUNIT'}`;
    uniqueIdentifier = crypto.createHash('md5')
      .update(fallbackSource)
      .digest('base64')
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 16);
  }

  const productId = `${uniqueIdentifier}-${targetSucursalId}`;

  return {
    id: productId,
    ean: sanitizedEan,
    nombre: descripcion,
    marca_producto: product.productos_marca ? product.productos_marca.trim() : 'Sin Marca',
    precio: precio,
    cantidad_presentacion: product.productos_cantidad_presentacion ? product.productos_cantidad_presentacion.trim() : '1',
    unidad_medida_presentacion: product.productos_unidad_medida_presentacion ? product.productos_unidad_medida_presentacion.trim() : 'unidad',
    supermercado_marca: targetBrand,
    sucursal_id: targetSucursalId,
    stock: true,
    ultima_actualizacion: new Date().toISOString()
  };
}

function normalizeBranchData(branch, brand, branchId) {
  return {
    id_sucursal: String(branchId),
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
    ultima_actualizacion: new Date().toISOString()
  };
}

const BRANCH_FILES_STARTED = new Set();

async function procesarZipInterno(zipPath, allFilteredSucursalesByBrand, zipFileName) {
  const innerDirectory = await unzipper.Open.file(zipPath);

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

  // Map to link products to branches within this ZIP
  // Key: `${id_comercio}_${id_bandera}_${id_sucursal}`
  const branchesInThisZip = new Map();

  if (sucursalFile) {
    try {
      const sucursalStream = sucursalFile.stream();
      await procesarCsvStream(sucursalStream, (doc) => {
        let foundBrand = doc.comercio_razon_social || 'Desconocido';

        for (const brand in TARGET_COMERCIO_IDENTIFIERS) {
          const keywords = TARGET_COMERCIO_IDENTIFIERS[brand].razon_social_keywords;
          const cuits = TARGET_COMERCIO_IDENTIFIERS[brand].cuits;
          if (keywords.some(kw => (doc.comercio_razon_social || '').toLowerCase().includes(kw.toLowerCase())) ||
            cuits.includes(String(doc.comercio_cuit))) {
            foundBrand = brand;
            break;
          }
        }

        const branchId = doc.id_sucursal;
        const normalizedSucursal = normalizeBranchData(doc, foundBrand, branchId);

        if (!allFilteredSucursalesByBrand.has(foundBrand)) {
          allFilteredSucursalesByBrand.set(foundBrand, new Map());
        }
        allFilteredSucursalesByBrand.get(foundBrand).set(branchId, normalizedSucursal);

        const parts = [
          String(doc.id_comercio || '').trim(),
          String(doc.id_bandera || '').trim(),
          String(doc.id_sucursal || '').trim()
        ];
        const key = parts.join('_');
        branchesInThisZip.set(key, { brand: foundBrand, branchId: branchId });
      }, sucursalFile.path);
    } catch (error) {
      console.error(`Error al procesar archivo de sucursal en '${zipFileName}':`, error.message);
    }
  }

  if (productFile) {
    try {
      const productStream = productFile.stream();
      await procesarCsvStream(productStream, (doc) => {
        const productCsvIdComercio = String(doc.id_comercio || '').trim();
        const productCsvIdBandera = String(doc.id_bandera || '').trim();
        const productCsvIdSucursal = String(doc.id_sucursal || '').trim();

        const key = `${productCsvIdComercio}_${productCsvIdBandera}_${productCsvIdSucursal}`;
        const branchInfo = branchesInThisZip.get(key);

        if (branchInfo) {
          const { brand, branchId } = branchInfo;

          if (!MARCAS_NORMALIZADAS_INTERES.has(brand)) return;

          const normalizedProduct = normalizeProductData(doc, brand, branchId);
          if (normalizedProduct) {
            const safeBrandName = brand.replace(/[^a-z0-9]/gi, '').toLowerCase();
            const brandDir = path.join(BASE_PRODUCTS_DIR, safeBrandName);
            const productFilename = path.join(brandDir, `${branchId}.jsonl`);

            if (!BRANCH_FILES_STARTED.has(productFilename)) {
              if (!fs.existsSync(brandDir)) fs.mkdirSync(brandDir, { recursive: true });
              fs.writeFileSync(productFilename, '', 'utf8');
              BRANCH_FILES_STARTED.add(productFilename);
            }

            fs.appendFileSync(productFilename, JSON.stringify(normalizedProduct) + '\n', 'utf8');
          }
        }
      }, productFile.path);
    } catch (error) {
      console.error(`Error al procesar archivo de productos en '${zipFileName}':`, error.message);
    }
  }
}

async function writeFinalJsons(allFilteredSucursalesByBrand) {
  const baseSuperDir = BASE_SUPER_DIR;
  await fsp.mkdir(baseSuperDir, { recursive: true });

  console.log(`\nEscribiendo archivos JSON de sucursales en '${baseSuperDir}'...`);
  let totalSucursalesWritten = 0;
  for (const [brandName, sucursalesMap] of allFilteredSucursalesByBrand.entries()) {
    if (!MARCAS_NORMALIZADAS_INTERES.has(brandName)) continue;

    for (const [branchId, sucursalData] of sucursalesMap.entries()) {
      const sucursalFilename = path.join(baseSuperDir, `${branchId}.json`);
      await writeToJson([sucursalData], sucursalFilename);
      totalSucursalesWritten++;
    }
  }
  console.log(`Archivos JSON de sucursales completados. Total escritos: ${totalSucursalesWritten}.`);

  console.log(`\nConvirtiendo archivos JSONL a JSON finales en '${BASE_PRODUCTS_DIR}'...`);
  let totalProductsFilesWritten = 0;

  for (const jsonlPath of BRANCH_FILES_STARTED) {
    try {
      const jsonPath = jsonlPath.replace(/\.jsonl$/, '.json');
      const lines = fs.readFileSync(jsonlPath, 'utf8').trim().split('\n');
      const products = lines.map(line => JSON.parse(line));

      await fsp.writeFile(jsonPath, JSON.stringify(products, null, 2), 'utf8');
      await fsp.unlink(jsonlPath); // Eliminar el archivo temporal
      totalProductsFilesWritten++;
    } catch (err) {
      console.error(`Error al convertir ${jsonlPath}:`, err.message);
    }
  }

  console.log(`Generación de JSONs de productos finalizada. Total: ${totalProductsFilesWritten}.`);
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



async function generarJsonFiltrados() {
  const downloadDate = new Date();
  console.log(`\n=== Iniciando proceso de descarga y procesamiento ===`);
  console.log(`Fecha/Hora: ${downloadDate.toISOString()}`);
  console.log(`Día de la semana: ${downloadDate.getDay()} (${['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][downloadDate.getDay()]})`);

  try {
    console.log('\nIniciando proceso de filtrado y generación de JSONs...');

    await fsp.mkdir(TEMP_DATA_DIR, { recursive: true });
    console.log(`Directorio temporal creado/verificado: ${TEMP_DATA_DIR}`);

    const today = new Date();
    const dayOfWeek = today.getDay();
    const currentDayZipUrl = DAILY_URLS[dayOfWeek];

    if (!currentDayZipUrl) {
      throw new Error(`No se encontró URL de descarga para el día de la semana actual (${dayOfWeek}). Por favor, verifica la constante DAILY_URLS.`);
    }

    console.log(`Intentando descargar y abrir ZIP desde: ${tempZipPath}`);
    await downloadZipWithRetries(currentDayZipUrl, tempZipPath, 3, 5000);

    console.log('Abriendo ZIP principal...');
    let directory;
    try {
      directory = await unzipper.Open.file(tempZipPath);
    } catch (unzipError) {
      console.error('Error al abrir el ZIP:', unzipError.message);
      throw new Error(`No se pudo abrir el archivo ZIP. Posiblemente esté corrupto: ${unzipError.message}`);
    }

    const allFoundZips = directory.files.filter(f => f.path.toLowerCase().endsWith('.zip')).map(f => f.path);
    console.log('DEBUG: Todos los ZIPs encontrados (rutas completas):', allFoundZips);

    // Filter deleted: Process all ZIPs found
    let zipsInternos = directory.files.filter(f => f.path.toLowerCase().endsWith('.zip'));

    if (zipsInternos.length === 0) {
      console.error('No se encontraron ZIPs internos para procesar.');
      console.log('Archivos encontrados:', allFoundZips);
      return;
    }

    console.log(`Encontrados ${zipsInternos.length} ZIPs internos especificados para procesar.`);
    console.log('Listando ZIPs internos que serán procesados:');
    zipsInternos.forEach(zip => console.log(`- ${zip.path}`));

    const allFilteredSucursalesByBrand = new Map();
    const processingErrors = [];

    for (const zip of zipsInternos) {
      const internalZipFileName = path.basename(zip.path);

      // FILTRO POR PREFIJO: Evitar procesar ZIPs de supermercados no deseados
      const shouldProcess = Array.from(KNOWN_ZIPS_TO_PROCESS_PREFIXES).some(prefix => internalZipFileName.startsWith(prefix));

      if (!shouldProcess) {
        // console.log(`[SKIP] Skip ${internalZipFileName} (No coincide con marcas de interés)`);
        continue;
      }

      console.log(`Procesando ZIP interno: ${internalZipFileName}`);
      try {
        const tempInnerZipPath = path.join(TEMP_DATA_DIR, `inner_${Math.random().toString(36).substring(7)}.zip`);
        await pipeline(zip.stream(), fs.createWriteStream(tempInnerZipPath));
        await procesarZipInterno(tempInnerZipPath, allFilteredSucursalesByBrand, internalZipFileName);
        await fsp.unlink(tempInnerZipPath);
      } catch (innerZipError) {
        const errorMsg = `Error al extraer o procesar el ZIP interno ${zip.path}: ${innerZipError.message}`;
        console.error(errorMsg);
        processingErrors.push(errorMsg);
      }
    }
    console.log('\nTodos los ZIPs internos procesados.');

    if (processingErrors.length > 0) {
      console.warn(`\n[WARN] Se encontraron ${processingErrors.length} errores durante el procesamiento:`);
      processingErrors.forEach(err => console.warn(`  - ${err}`));
    }

    console.log('\n--- Escribiendo archivos JSON locales ---');
    await writeFinalJsons(allFilteredSucursalesByBrand);
    console.log('Archivos JSON locales actualizados completamente.');

    console.log('\n=== Proceso completado exitosamente ===');
    console.log(`Sucursales actualizadas: ${Array.from(allFilteredSucursalesByBrand.values()).reduce((acc, map) => acc + map.size, 0)}`);

    process.exit(0);

  } catch (error) {
    console.error('\n=== Error crítico en el proceso general ===');
    console.error('Mensaje:', error.message);
    console.error('Stack:', error.stack);
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

generarJsonFiltrados();