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
    5: 'https://datos.produccion.gob.ar/dataset/6f47ec76-d1ce-4e34-a7e1-621fe9b1d0b5/resource/91bc072a-4726-44a1-85ec-4a8467aad27e/download/sepa_viernes.zip',
    6: 'https://datos.produccion.gob.ar/dataset/6f47ec76-d1ce-4e34-a7e1-621fe9b1d0b5/resource/b3c3da5d-213d-41e7-8d74-f23fda0a3c30/download/sepa_sabado.zip',
};

const tempZipPath = path.join(__dirname, 'temp_sepa.zip');

const KNOWN_ZIPS_TO_PROCESS_PREFIXES = new Set([
    'sepa_1_comercio-sepa-10',
    'sepa_1_comercio-sepa-15',
    'sepa_1_comercio-sepa-1003'
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

async function writeToJson(data, filename) {
    if (data.length === 0) {
        console.log(`No hay datos para escribir en ${filename}. El archivo estará vacío o no se creará.`);
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

async function procesarZipInterno(bufferZip, allFilteredSucursalesByBrand, allProductsByBranch, zipName) {
    const directory = await unzipper.Open.buffer(bufferZip);
    const sucursalesFile = directory.files.find(f => f.path.toLowerCase().includes('sucursales.csv'));
    const productosFile = directory.files.find(f => f.path.toLowerCase().includes('productos.csv'));
    const comercioFile = directory.files.find(f => f.path.toLowerCase().includes('comercio.csv'));

    if (!comercioFile || !sucursalesFile || !productosFile) {
        console.warn(`[!] Faltan archivos CSV esperados (comercio, sucursales, productos) en el ZIP interno ${zipName}. Saltando.`);
        return;
    }

    const comerciosMap = new Map();
    const filteredSucursalesForThisZip = new Map();

    const comercios = await procesarCsvStream(comercioFile.stream(), `${zipName}/comercio.csv`);
    comercios.forEach(c => {
        const id_comercio = c.id_comercio;
        const comercioCuit = c.comercio_cuit || '';
        const comercioRazonSocial = c.comercio_razon_social || '';
        if (id_comercio) {
            comerciosMap.set(id_comercio, {
                comercio_razon_social: comercioRazonSocial.toLowerCase(),
                comercio_bandera_nombre: c.comercio_bandera_nombre || '',
                comercio_cuit: comercioCuit
            });
        }
    });

    const sucurales = await procesarCsvStream(sucursalesFile.stream(), `${zipName}/sucursales.csv`);
    sucurales.forEach(row => {
        const id_comercio_from_sucursal = row.id_comercio;
        const id_sucursal = row.id_sucursal;

        if (!id_sucursal || !id_comercio_from_sucursal) {
            return;
        }

        const comercioInfo = comerciosMap.get(id_comercio_from_sucursal);
        if (!comercioInfo) {
            console.warn(`[WARN] No se encontró información de comercio para id_comercio: ${id_comercio_from_sucursal} en sucursal ${id_sucursal}. Saltando.`);
            return;
        }

        const sucursalLat = parseFloat(row.sucursales_latitud);
        const sucursalLon = parseFloat(row.sucursales_longitud);

        if (isNaN(sucursalLat) || isNaN(sucursalLon)) {
            console.warn(`[COORD_INV] Sucursal ${id_sucursal} (Comercio: ${comercioInfo.comercio_razon_social}, CUIT: ${comercioInfo.comercio_cuit}) tiene coordenadas inválidas: lat=${row.sucursales_latitud}, lon=${row.sucursales_longitud}. Saltando.`);
            return;
        }

        let bestMatchedBrand = null;
        let bestMatchedLocationName = null;
        let minDistanceFound = Infinity;

        let identifiedBrandByComercio = null;
        for (const brandKey in TARGET_COMERCIO_IDENTIFIERS) {
            const identifiers = TARGET_COMERCIO_IDENTIFIERS[brandKey];
            const matchedByRazonSocial = identifiers.razon_social_keywords.some(keyword => comercioInfo.comercio_razon_social.includes(keyword.toLowerCase()));
            const matchedByCuit = identifiers.cuits.some(cuit => comercioInfo.comercio_cuit === cuit);

            if (matchedByRazonSocial || matchedByCuit) {
                identifiedBrandByComercio = brandKey;
                break;
            }
        }

        let isLocationMatch = false;
        let distanceToTarget = Infinity;

        if (identifiedBrandByComercio) {
            for (const targetLocation of TARGET_SUPERMARKETS_LOCATIONS) {
                if (targetLocation.brand === identifiedBrandByComercio) {
                    const distance = getDistance(sucursalLat, sucursalLon, targetLocation.lat, targetLocation.lon);
                    distanceToTarget = Math.min(distanceToTarget, distance);

                    const isSpecificSucursalMatch = targetLocation.id_sucursal ? String(targetLocation.id_sucursal) === String(id_sucursal) : false;

                    if (distance <= DISTANCE_THRESHOLD || isSpecificSucursalMatch) {
                        isLocationMatch = true;
                        if (distance < minDistanceFound || isSpecificSucursalMatch) {
                            minDistanceFound = distance;
                            bestMatchedBrand = targetLocation.brand;
                            bestMatchedLocationName = targetLocation.name;
                        }
                    }
                }
            }
        }

        if (bestMatchedBrand && isLocationMatch) {
            console.log(`[MATCH] Sucursal ${id_sucursal} (${row.sucursal_nombre || 'N/A'}) en [${sucursalLat}, ${sucursalLon}] (Comercio: ${comercioInfo.comercio_razon_social}, CUIT: ${comercioInfo.comercio_cuit}) **COINCIDE** con '${bestMatchedLocationName}' (${bestMatchedBrand}). Distancia: ${minDistanceFound.toFixed(6)} (Umbral: ${DISTANCE_THRESHOLD})`);

            const normalizedBrand = normalizeSupermarketBrand(bestMatchedBrand);

            if (!MARCAS_NORMALIZADAS_INTERES.has(normalizedBrand)) {
                console.warn(`[WARN] Sucursal ${id_sucursal} (Comercio: ${comercioInfo.comercio_razon_social}) coincide por ubicación y marca de comercio, pero la marca normalizada (${normalizedBrand}) no está en la lista final de marcas a guardar. Saltando.`);
                return;
            }

            const sucursalData = {
                id_sucursal: id_sucursal,
                nombre_sucursal: row.sucursal_nombre || '',
                direccion_sucursal: row.sucursal_direccion || '',
                provincia: row.sucursales_provincia || '',
                localidad: row.sucursales_localidad || '',
                id_comercio: id_comercio_from_sucursal,
                comercio_razon_social: comercioInfo.comercio_razon_social,
                comercio_bandera_nombre: comercioInfo.comercio_bandera_nombre,
                marca: normalizedBrand,
                latitud: sucursalLat,
                longitud: sucursalLon,
                ultima_actualizacion: Timestamp.now()
            };

            const brandName = sucursalData.marca;
            if (!allFilteredSucursalesByBrand.has(brandName)) {
                allFilteredSucursalesByBrand.set(brandName, new Map());
            }
            allFilteredSucursalesByBrand.get(brandName).set(id_sucursal, sucursalData);
            filteredSucursalesForThisZip.set(id_sucursal, sucursalData);
        }
    });

    if (filteredSucursalesForThisZip.size > 0) {
        console.log(`[+] Encontradas ${filteredSucursalesForThisZip.size} sucursales de interés en ${zipName}. Procesando productos...`);
        const productos = await procesarCsvStream(productosFile.stream(), `${zipName}/productos.csv`);

        productos.forEach(p => {
            const id_sucursal_producto = p.id_sucursal;
            const sucursalInfo = filteredSucursalesForThisZip.get(id_sucursal_producto);

            if (sucursalInfo) {
                const precioLista = parseFloat(p.productos_precio_lista || '0');
                const stockStatus = (precioLista > 0 && !isNaN(precioLista));

                const productData = {
                    id: `${p.id_producto}-${id_sucursal_producto}`,
                    id_producto_original: p.id_producto,
                    nombre: p.productos_descripcion || 'Producto sin descripción',
                    precio: precioLista || 0,
                    supermercado_marca: sucursalInfo.marca,
                    sucursal_id: sucursalInfo.id_sucursal,
                    sucursal_nombre: sucursalInfo.nombre_sucursal,
                    stock: stockStatus,
                    ean: p.productos_ean || '',
                    marca_producto: p.productos_marca || 'Sin Marca',
                    cantidad_presentacion: parseFloat(p.productos_cantidad_presentacion || '0') || null,
                    unidad_medida_presentacion: p.productos_unidad_medida_presentacion || '',
                };

                const brandName = sucursalInfo.marca;
                const branchId = sucursalInfo.id_sucursal;

                if (!allProductsByBranch.has(brandName)) {
                    allProductsByBranch.set(brandName, new Map());
                }
                const productsInBrand = allProductsByBranch.get(brandName);
                if (!productsInBrand.has(branchId)) {
                    productsInBrand.set(branchId, []);
                }
                productsInBrand.get(branchId).push(productData);
            }
        });
    } else {
        console.log(`No hay sucursales de interés para procesar productos en este ZIP interno (${zipName}).`);
    }
}

async function uploadBatchToFirestore(collectionName, documents, idField, isProductUpdate = false) {
    const BATCH_SIZE = 400;
    let batch = db.batch();
    let batchCount = 0;
    let uploadedCount = 0;
    let failedDocuments = [];
    const currentTimestamp = Timestamp.now();

    console.log(`Iniciando subida por lotes a la colección '${collectionName}'. Total de documentos: ${documents.length}`);

    if (isProductUpdate) {
        const newProductsMap = new Map();
        documents.forEach(p => newProductsMap.set(p[idField], p));

        const existingProductsDocs = await db.collection(collectionName).get();
        const existingProductsMap = new Map();
        existingProductsDocs.forEach(doc => existingProductsMap.set(doc.id, doc.data()));

        let addedCount = 0;
        let updatedCount = 0;
        let deactivatedCount = 0;

        for (const [id, newProductData] of newProductsMap.entries()) {
            const existingProductData = existingProductsMap.get(id);
            newProductData.ultima_actualizacion = currentTimestamp;

            if (!existingProductData) {
                const docRef = db.collection(collectionName).doc(id);
                batch.set(docRef, newProductData);
                batchCount++;
                addedCount++;
            } else {
                const isModified = existingProductData.precio !== newProductData.precio ||
                                   existingProductData.stock !== newProductData.stock;

                if (isModified) {
                    const docRef = db.collection(collectionName).doc(id);
                    batch.update(docRef, {
                        precio: newProductData.precio,
                        stock: newProductData.stock,
                        ultima_actualizacion: currentTimestamp,
                    });
                    batchCount++;
                    updatedCount++;
                }
            }

            if (batchCount === BATCH_SIZE) {
                try {
                    await batch.commit();
                    uploadedCount += batchCount;
                    batch = db.batch();
                    batchCount = 0;
                } catch (error) {
                    console.error(`Error al subir lote de productos a '${collectionName}'.`, error);
                    batch = db.batch();
                    batchCount = 0;
                }
            }
        }

        for (const [id, existingProductData] of existingProductsMap.entries()) {
            if (!newProductsMap.has(id)) {
                if (existingProductData.stock !== false) {
                    const docRef = db.collection(collectionName).doc(id);
                    batch.update(docRef, {
                        stock: false,
                        ultima_actualizacion: currentTimestamp
                    });
                    batchCount++;
                    deactivatedCount++;
                }
            }

            if (batchCount === BATCH_SIZE) {
                try {
                    await batch.commit();
                    uploadedCount += batchCount;
                    batch = db.batch();
                    batchCount = 0;
                } catch (error) {
                    console.error(`Error al actualizar stock de productos en '${collectionName}'.`, error);
                    batch = db.batch();
                    batchCount = 0;
                }
            }
        }

        if (batchCount > 0) {
            try {
                await batch.commit();
                uploadedCount += batchCount;
            } catch (error) {
                console.error(`Error al subir lote final de productos a '${collectionName}'.`, error);
            }
        }

        console.log(`Actualización incremental de productos en '${collectionName}' finalizada.`);
        console.log(`    Añadidos: ${addedCount}, Actualizados: ${updatedCount}, Desactivados: ${deactivatedCount}`);
        return { successCount: uploadedCount, failedDocuments: [] };

    } else {
        for (let i = 0; i < documents.length; i++) {
            const docData = documents[i];
            const docId = String(docData[idField]);

            if (!docId || docId === 'undefined' || docId === '[object Object]') {
                console.warn(`[SKIP] Documento sin ID válido en '${idField}'. Saltando documento:`, docData);
                failedDocuments.push(docData);
                continue;
            }

            const docRef = db.collection(collectionName).doc(docId);
            batch.set(docRef, docData, { merge: true });
            batchCount++;

            if (batchCount === BATCH_SIZE || i === documents.length - 1) {
                try {
                    await batch.commit();
                    uploadedCount += batchCount;
                    console.log(`    Lote de ${batchCount} documentos subido a '${collectionName}'. Total subidos: ${uploadedCount}`);
                    batch = db.batch();
                    batchCount = 0;
                } catch (error) {
                    console.error(`Error al subir lote a la colección '${collectionName}'. Documentos procesados hasta el error: ${i + 1}.`, error);
                    for (let j = i - batchCount + 1; j <= i; j++) {
                        failedDocuments.push(documents[j]);
                    }
                    batch = db.batch();
                    batchCount = 0;
                }
            }
        }
        console.log(`Subida por lotes a '${collectionName}' finalizada. Documentos subidos: ${uploadedCount}. Documentos fallidos: ${failedDocuments.length}`);
        return { successCount: uploadedCount, failedDocuments: failedDocuments };
    }
}

async function generarJsonFiltradosYSubirAFirestore() {
    let allSucursalesForBackup = [];
    let allProductsForBackup = [];

    try {
        console.log('Iniciando proceso de filtrado, generación de JSONs y subida a Firestore...');

        const today = new Date();
        const dayOfWeek = today.getDay();
        const currentDayZipUrl = DAILY_URLS[dayOfWeek];

        if (!currentDayZipUrl) {
            throw new Error(`No se encontró URL de descarga para el día de la semana actual (${dayOfWeek}). Por favor, verifica la constante DAILY_URLS.`);
        }

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
                console.error(`Error al extraer o procesar el ZIP interno ${zip.path}. Saltando al siguiente ZIP.`, innerZipError);
            }
        }
        console.log('\nTodos los ZIPs internos procesados.');

        const baseSuperDir = path.join(__dirname, '../src/data/super');
        await fsp.mkdir(baseSuperDir, { recursive: true });
        console.log(`Carpeta base de sucursales '${baseSuperDir}' creada/verificada.`);

        console.log(`Escribiendo archivos JSON de sucursales (uno por marca) en 'src/data/super/'...`);
        let totalUniqueSucursales = 0;
        for (const [brandName, sucursalesMap] of allFilteredSucursalesByBrand.entries()) {
            if (MARCAS_NORMALIZADAS_INTERES.has(brandName)) {
                const safeBrandName = brandName.replace(/[^a-z0-9]/gi, '').toLowerCase();
                const branchFilename = path.join(baseSuperDir, `${safeBrandName}.json`);
                const sucursalesList = Array.from(sucursalesMap.values());
                allSucursalesForBackup.push(...sucursalesList);
                await writeToJson(sucursalesList, branchFilename);
                totalUniqueSucursales += sucursalesList.length;
            }
        }
        console.log(`Total de sucursales únicas encontradas: ${totalUniqueSucursales}`);

        const baseProductsDir = path.join(__dirname, '../src/data/products');
        await fsp.mkdir(baseProductsDir, { recursive: true });
        console.log(`Carpeta base de productos '${baseProductsDir}' creada/verificada.`);

        let totalProductsFilesWritten = 0;
        console.log(`Escribiendo archivos JSON de productos (por marca y sucursal) en 'src/data/products/'...`);
        for (const [brandName, branchesMap] of allProductsByBranch.entries()) {
            if (MARCAS_NORMALIZADAS_INTERES.has(brandName)) {
                const safeBrandName = brandName.replace(/[^a-z0-9]/gi, '').toLowerCase();
                const brandDir = path.join(baseProductsDir, safeBrandName);
                await fsp.mkdir(brandDir, { recursive: true });
                console.log(`    Creando directorio para marca: ${brandName}`);

                for (const [branchId, productsList] of branchesMap.entries()) {
                    const productFilename = path.join(brandDir, `${branchId}.json`);
                    await writeToJson(productsList, productFilename);
                    totalProductsFilesWritten++;
                    allProductsForBackup.push(...productsList);
                }
            }
        }
        console.log(`Generación de JSONs finalizada. Total de archivos de productos escritos: ${totalProductsFilesWritten}.`);
        console.log('Puedes revisar los archivos JSON en src/data/super/ y src/data/products/.');

        console.log('\n--- Subiendo sucursales a Firestore ---');
        for (const [brandName, sucursalesMap] of allFilteredSucursalesByBrand.entries()) {
            if (MARCAS_NORMALIZADAS_INTERES.has(brandName)) {
                const safeBrandName = brandName.replace(/[^a-z0-9]/gi, '').toLowerCase();
                const collectionPath = `supermercados/${safeBrandName}/sucursales`;
                const sucursalesList = Array.from(sucursalesMap.values());

                if (sucursalesList.length > 0) {
                    const { successCount, failedDocuments } = await uploadBatchToFirestore(collectionPath, sucursalesList, 'id_sucursal', false);
                    if (failedDocuments.length > 0) {
                        console.warn(`[WARN] ${failedDocuments.length} sucursales fallaron al subir a Firestore para la marca ${brandName}. Estos ya están en el backup local.`);
                    }
                }
            }
        }
        console.log('Subida de sucursales a Firestore finalizada.');

        console.log('\n--- Subiendo productos a Firestore (Actualización Incremental) ---');
        let totalProductsUploaded = 0;
        for (const [brandName, branchesMap] of allProductsByBranch.entries()) {
            if (MARCAS_NORMALIZADAS_INTERES.has(brandName)) {
                const safeBrandName = brandName.replace(/[^a-z0-9]/gi, '').toLowerCase();

                for (const [branchId, productsList] of branchesMap.entries()) {
                    const collectionPath = `supermercados/${safeBrandName}/sucursales/${branchId}/productos`;
                    if (productsList.length > 0) {
                        const { successCount, failedDocuments } = await uploadBatchToFirestore(collectionPath, productsList, 'id', true);
                        totalProductsUploaded += successCount;
                    }
                }
            }
        }
        console.log(`Total de operaciones de productos realizadas en Firestore (añadidos/actualizados/desactivados): ${totalProductsUploaded}.`);
        console.log('Puedes verificar los datos en tu consola de Firebase Firestore.');

        process.exit(0);
    } catch (error) {
        console.error('\nError crítico en el proceso:', error);
        try {
            console.log('Intentando guardar datos procesados localmente debido a un error crítico...');
            const backupDir = path.join(__dirname, '../src/data/backup');
            await fsp.mkdir(backupDir, { recursive: true });

            if (allSucursalesForBackup.length > 0) {
                await writeToJson(allSucursalesForBackup, path.join(backupDir, 'sucursales_full_backup.json'));
            } else {
                console.log('No hay sucursales procesadas para guardar en backup.');
            }

            if (allProductsForBackup.length > 0) {
                await writeToJson(allProductsForBackup, path.join(backupDir, 'productos_full_backup.json'));
            } else {
                console.log('No hay productos procesados para guardar en backup.');
            }
            console.log('Datos de backup guardados en src/data/backup.');
        } catch (backupError) {
            console.error('Error al intentar guardar datos de backup:', backupError);
        }
        process.exit(1);
    } finally {
        try {
            if (fs.existsSync(tempZipPath)) {
                await fsp.unlink(tempZipPath);
                console.log(`Archivo ZIP temporal eliminado: ${tempZipPath}`);
            }
        } catch (unlinkError) {
            if (unlinkError.code !== 'ENOENT') {
                console.warn(`No se pudo eliminar el archivo temporal ${tempZipPath}:`, unlinkError);
            }
        }
    }
}

generarJsonFiltradosYSubirAFirestore();