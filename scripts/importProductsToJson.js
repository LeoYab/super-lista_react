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
    'sepa_1_comercio-sepa-10_',
    'sepa_1_comercio-sepa-11_',
    'sepa_1_comercio-sepa-15_'
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

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (buffer.length === 0) {
            throw new Error('El archivo ZIP descargado está vacío');
        }

        if (buffer.length < 22) {
            throw new Error(`El archivo ZIP es muy pequeño (${buffer.length} bytes) - posiblemente corrupto`);
        }

        const zipSignature = buffer.subarray(0, 4);
        const validZipSignatures = [
            Buffer.from([0x50, 0x4B, 0x03, 0x04]),
            Buffer.from([0x50, 0x4B, 0x05, 0x06]),
            Buffer.from([0x50, 0x4B, 0x07, 0x08])
        ];

        const isValidZip = validZipSignatures.some(sig => zipSignature.equals(sig));
        if (!isValidZip) {
            throw new Error('El archivo descargado no parece ser un ZIP válido');
        }

        await fsp.writeFile(outputPath, buffer);
        console.log(`ZIP del día descargado en ${outputPath} (${buffer.length} bytes).`);
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
        console.warn('Producto con datos faltantes (descripción o precio), saltando:', product);
        return null;
    }

    const sanitizedEan = String(product.productos_ean || '').replace(/\D/g, '');

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

    const productId = `${uniqueIdentifier}-${targetSucursalId}`;

    let precio = parseFloat(String(product.productos_precio_lista).replace(',', '.'));
    if (isNaN(precio)) {
        console.warn(`Precio inválido para producto '${product.productos_descripcion}' (EAN: '${product.productos_ean || uniqueIdentifier}'):`, product.productos_precio_lista);
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
        ultima_actualizacion: new Date().toISOString()
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
        ultima_actualizacion: new Date().toISOString()
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
                }
            }
        } catch (error) {
            console.error(`Error al procesar archivo de productos en '${zipFileName}':`, error.message);
        }
    }
}

async function writeFinalJsons(allProductsByBranchFromZip, allFilteredSucursalesByBrand) {
    const baseSuperDir = BASE_SUPER_DIR;
    await fsp.mkdir(baseSuperDir, { recursive: true });

    console.log(`\nEscribiendo archivos JSON de sucursales en '${baseSuperDir}'...`);
    let totalSucursalesWritten = 0;
    for (const [brandName, sucursalesMap] of allFilteredSucursalesByBrand.entries()) {
        if (MARCAS_NORMALIZADAS_INTERES.has(brandName)) {
            for (const [branchId, sucursalData] of sucursalesMap.entries()) {
                const sucursalFilename = path.join(baseSuperDir, `${branchId}.json`);
                await writeToJson([sucursalData], sucursalFilename);
                totalSucursalesWritten++;
                console.log(`    Sucursal ${brandName}/${branchId} escrita en '${sucursalFilename}'.`);
            }
        }
    }
    console.log(`Archivos JSON de sucursales completados. Total escritos: ${totalSucursalesWritten}.`);

    const baseProductsDir = BASE_PRODUCTS_DIR;
    await fsp.mkdir(baseProductsDir, { recursive: true });

    console.log(`\nEscribiendo archivos JSON de productos (por marca y sucursal) en '${baseProductsDir}' (sobrescribiendo)...`);

    /* const existingProductBrands = await fsp.readdir(baseProductsDir, { withFileTypes: true });
    for (const brandDirEntry of existingProductBrands) {
        if (brandDirEntry.isDirectory()) {
            const brandPath = path.join(baseProductsDir, brandDirEntry.name);
            console.log(`    Limpiando directorio de marca de productos existente: ${brandPath}`);
            await fsp.rm(brandPath, { recursive: true, force: true });
        }
    } */

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
    try {
        console.log('Iniciando proceso de filtrado y generación de JSONs...');

        await fsp.mkdir(TEMP_DATA_DIR, { recursive: true });
        console.log(`Directorio temporal creado/verificado: ${TEMP_DATA_DIR}`);

        const today = new Date();
        const dayOfWeek = today.getDay();
        const currentDayZipUrl = DAILY_URLS[dayOfWeek];

        if (!currentDayZipUrl) {
            throw new Error(`No se encontró URL de descarga para el día de la semana actual (${dayOfWeek}). Por favor, verifica la constante DAILY_URLS.`);
        }

        console.log(`Intentando descargar ZIP desde: ${currentDayZipUrl}`);
        const bufferZip = await downloadZipWithRetries(currentDayZipUrl, tempZipPath, 3, 5000);

        console.log('Descomprimiendo ZIP principal...');
        let directory;
        try {
            directory = await unzipper.Open.buffer(bufferZip);
        } catch (unzipError) {
            console.error('Error al descomprimir el ZIP:', unzipError.message);
            console.log(`Tamaño del buffer: ${bufferZip ? bufferZip.length : 'undefined'} bytes`);
            throw new Error(`No se pudo descomprimir el archivo ZIP. Posiblemente esté corrupto: ${unzipError.message}`);
        }

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

        console.log('\n--- Escribiendo archivos JSON locales ---');
        await writeFinalJsons(allProductsByBranch, allFilteredSucursalesByBrand);
        console.log('Archivos JSON locales actualizados completamente.');

        console.log('\nProceso completado exitosamente. Todos los datos de interés fueron procesados y guardados en archivos JSON.');
        process.exit(0);

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

generarJsonFiltrados();