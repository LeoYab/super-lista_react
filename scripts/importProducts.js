// scripts/importProducts.js

require('dotenv').config(); // Asegúrate de tener dotenv instalado: npm install dotenv
const unzipper = require('unzipper'); // Asegúrate de tener unzipper instalado: npm install unzipper
const csv = require('csv-parser');   // Asegúrate de tener csv-parser instalado: npm install csv-parser
const fetch = require('node-fetch'); // Asegúrate de tener node-fetch instalado: npm install node-fetch
const stream = require('stream');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs'); // Importa 'fs' para funciones de stream como createWriteStream
const fsp = require('fs/promises'); // Importa 'fs/promises' para funciones asíncronas basadas en promesas

// Importar Firebase Admin SDK
const admin = require('firebase-admin');

// --- Configuración de Firebase ---
// Asegúrate de tener tu archivo de credenciales de servicio de Firebase.
// Puedes descargarlo desde la Consola de Firebase -> Configuración del proyecto -> Cuentas de servicio.
// Guarda el archivo JSON en la raíz de tu proyecto o donde sea accesible.
// Es una buena práctica no subir este archivo a control de versiones.
const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
    // databaseURL: "https://TU_ID_PROYECTO.firebaseio.com" // Opcional, si usas Realtime Database
});

const db = admin.firestore();
// --- Fin de Configuración de Firebase ---


const pipeline = promisify(stream.pipeline);

// URLs de descarga por día de la semana, verificadas al 16/07/2024.
// Es crucial que estas URLs estén actualizadas, ya que pueden cambiar con el tiempo.
const DAILY_URLS = {
    0: 'https://datos.produccion.gob.ar/dataset/6f47ec76-d1ce-4e34-a7e1-621fe9b1d0b5/resource/f8e75128-515a-436e-bf8d-5c63a62f2005/download/sepa_domingo.zip',     // Domingo (0)
    1: 'https://datos.produccion.gob.ar/dataset/6f47ec76-d1ce-4e34-a7e1-621fe9b1d0b5/resource/0a9069a9-06e8-4f98-874d-da5578693290/download/sepa_lunes.zip',       // Lunes (1)
    2: 'https://datos.produccion.gob.ar/dataset/6f47ec76-d1ce-4e34-a7e1-621fe9b1d0b5/resource/9dc06241-cc83-44f4-8e25-c9b1636b8bc8/download/sepa_martes.zip',      // Martes (2)
    3: 'https://datos.produccion.gob.ar/dataset/6f47ec76-d1ce-4e34-a7e1-621fe9b1d0b5/resource/1e92cd42-4f94-4071-a165-62c4cb2ce23c/download/sepa_miercoles.zip',  // Miércoles (3)
    4: 'https://datos.produccion.gob.ar/dataset/6f47ec76-d1ce-4e34-a7e1-621fe9b1d0b5/resource/d076720f-a7f0-4af8-b1d6-1b99d5a90c14/download/sepa_jueves.zip',     // Jueves (4)
    5: 'https://datos.produccion.gob.ar/dataset/6f47ec76-d1ce-4e34-a7e1-621fe9b1d0b5/resource/91bc072a-4726-44a1-85ec-4a8467aad27e/download/sepa_viernes.zip',    // Viernes (5)
    6: 'https://datos.produccion.gob.ar/dataset/6f47ec76-d1ce-4e34-a7e1-8d74-f23fda0a3c30/download/sepa_sabado.zip',        // Sábado (6)
};

const tempZipPath = path.join(__dirname, 'temp_sepa.zip'); // Ruta temporal para el ZIP descargado

// Filtro: Prefijos de los nombres de los ZIPs internos a procesar (sin la fecha/hora y extensión).
// Esto hace que el script sea robusto a los cambios diarios en los nombres de archivo.
const KNOWN_ZIPS_TO_PROCESS_PREFIXES = new Set([
    'sepa_1_comercio-sepa-10', // Carrefour
    'sepa_1_comercio-sepa-15', // Dia
    'sepa_1_comercio-sepa-11'  // ChangoMas
]);

// Filtro principal: Ubicaciones específicas de los supermercados de interés
// Si las coordenadas o IDs cambian en los datos de Precios Claros, deben actualizarse aquí.
const TARGET_SUPERMARKETS_LOCATIONS = [
    { name: 'Hipermercado Carrefour San Isidro', lat: -34.491345, lon: -58.589025, brand: 'Carrefour', id_sucursal: '1' },
    { name: 'DIA Jose Leon Suarez', lat: -34.532479, lon: -58.575497, brand: 'Dia', id_sucursal: '87' },
    { name: 'HiperChangomas San Fernando', lat: -34.484169, lon: -58.595829, brand: 'ChangoMas', id_sucursal: '1004' }
];

// Identificadores de Comercio (Razón Social y CUIT) para cada marca
// Estos son datos clave para identificar a qué cadena pertenece una sucursal.
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

const DISTANCE_THRESHOLD = 0.005; // Umbral de distancia para considerar una sucursal "cercana"

// Marcas normalizadas que queremos en los JSON finales y en Firestore
const MARCAS_NORMALIZADAS_INTERES = new Set([
    'Dia',
    'Carrefour',
    'ChangoMas'
]);

/**
 * Escribe datos en un archivo JSON.
 * @param {Array<Object>} data - Los datos a escribir.
 * @param {string} filename - La ruta completa del archivo.
 */
async function writeToJson(data, filename) {
    if (data.length === 0) {
        console.log(`No hay datos para escribir en ${filename}. **Archivo estará vacío o no se creará.**`);
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

/**
 * Calcula la distancia euclidiana entre dos puntos (latitud, longitud).
 * @param {number} lat1 - Latitud del punto 1.
 * @param {number} lon1 - Longitud del punto 1.
 * @param {number} lat2 - Latitud del punto 2.
 * @param {number} lon2 - Longitud del punto 2.
 * @returns {number} La distancia en grados.
 */
function getDistance(lat1, lon1, lat2, lon2) {
    const dx = lon1 - lon2;
    const dy = lat1 - lat2;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Procesa un stream CSV detectando automáticamente el delimitador y mapeando columnas.
 * Incluye un mapeo de encabezados común para mayor robustez.
 * @param {NodeJS.ReadableStream} streamCsv - El stream de datos CSV.
 * @param {string} filenameForLog - Nombre del archivo para mensajes de log.
 * @returns {Promise<Array<Object>>} Una promesa que resuelve con los documentos parseados.
 */
async function procesarCsvStream(streamCsv, filenameForLog = 'CSV desconocido') {
    return new Promise((resolve, reject) => {
        const docs = [];
        let buffer = '';
        let delimiterDetected = false;
        let parser;
        const readBufferLimit = 1024 * 5; // Leer los primeros 5KB para detectar delimitador

        const passthrough = new stream.PassThrough();

        // Mapeo flexible de nombres de columna para ID y CUIT/Razon Social
        const commonColumnMaps = {
            'id_comercio': ['id_comercio', 'id'],
            'id_sucursal': ['id_sucursal', '0', '1', '2'], // Puede ser la 2da columna (indice 1) o la 3ra (indice 2) en sucursales.csv
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
                        return; // Sigue leyendo hasta tener suficiente buffer o una línea completa
                    }

                    const firstLine = buffer.split('\n')[0];
                    let detectedDelimiter = ',';
                    let maxMatches = -1;

                    const potentialDelimiters = [',', ';', '|'];
                    const lowerCaseFirstLine = firstLine.toLowerCase();

                    for (const delim of potentialDelimiters) {
                        const headers = lowerCaseFirstLine.split(delim).map(h => h.trim());
                        let currentMatches = 0;

                        // Contar coincidencias con los nombres de columna esperados
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
                        // Si no hay coincidencias de encabezado, intentar inferir por presencia del caracter
                        if (firstLine.includes('|')) {
                            detectedDelimiter = '|';
                        } else if (firstLine.includes(';')) {
                            detectedDelimiter = ';';
                        } else {
                            detectedDelimiter = ',';
                        }
                        console.warn(`[!] No se pudieron encontrar encabezados esperados para ${filenameForLog}. Intentando inferir delimitador basado en caracteres: '${detectedDelimiter}'`);
                    } else if (firstLine.length === 0) {
                        // Si la primera línea está vacía, usar coma por defecto
                        detectedDelimiter = ',';
                    }

                    console.log(`[CSV] Delimitador detectado para ${filenameForLog}: '${detectedDelimiter}' (coincidencias de encabezados: ${maxMatches})`);

                    parser = csv({
                        separator: detectedDelimiter,
                        strict: false, // Permite que las filas tengan más/menos columnas de lo esperado
                        mapHeaders: ({ header, index }) => {
                            const normalizedHeader = header.toLowerCase().trim();
                            for (const key in commonColumnMaps) {
                                if (commonColumnMaps[key].includes(normalizedHeader)) {
                                    return key; // Retorna el nombre de columna estandarizado
                                }
                            }
                            // Si no hay mapeo, retorna el encabezado original o un nombre de columna basado en el índice
                            return normalizedHeader || `col_${index}`;
                        },
                        mapValues: ({ header, index, value }) => value.trim() // Limpia los valores de espacios en blanco
                    });
                    
                    parser.on('data', (data) => docs.push(data))
                            .on('end', () => resolve(docs))
                            .on('error', reject);

                    passthrough.pipe(parser);
                    passthrough.write(buffer);
                    buffer = ''; // Limpia el buffer después de escribirlo al parser
                    delimiterDetected = true;
                } else {
                    passthrough.write(chunk); // Si el delimitador ya se detectó, simplemente pasa el chunk
                }
            })
            .on('end', () => {
                // Si el stream terminó antes de detectar el delimitador (ej. archivo muy pequeño)
                if (!delimiterDetected) {
                    if (buffer.length > 0) {
                        console.warn(`[!] El archivo ${filenameForLog} es muy pequeño para una detección robusta. Intentando con delimitador por defecto (',').`);
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
                    passthrough.end(); // Asegura que el passthrough stream termine
                }
            })
            .on('error', reject);
    });
}

/**
 * Normaliza el nombre de la marca del supermercado.
 * @param {string} detectedBrand - La marca detectada.
 * @returns {string} La marca normalizada.
 */
function normalizeSupermarketBrand(detectedBrand) {
    // Aquí puedes añadir lógica más compleja si necesitas estandarizar nombres.
    // Por ejemplo: if (detectedBrand.includes('Coto')) return 'Coto';
    return detectedBrand;
}

/**
 * Procesa un ZIP interno que contiene archivos CSV de comercio, sucursales y productos.
 * Filtra sucursales por ubicación y marca, y extrae productos de esas sucursales.
 * @param {Buffer} bufferZip - El buffer del ZIP interno.
 * @param {Map<string, Map<string, Object>>} allFilteredSucursalesByBrand - Mapa para almacenar sucursales filtradas por marca.
 * @param {Map<string, Map<string, Array<Object>>>} allProductsByBranch - Mapa para almacenar productos por marca y sucursal.
 * @param {string} zipName - El nombre del archivo ZIP interno (para logs).
 */
async function procesarZipInterno(bufferZip, allFilteredSucursalesByBrand, allProductsByBranch, zipName) {
    const directory = await unzipper.Open.buffer(bufferZip);

    // Buscar los archivos CSV principales dentro del ZIP interno
    const sucursalesFile = directory.files.find(f => f.path.toLowerCase().includes('sucursales.csv'));
    const productosFile = directory.files.find(f => f.path.toLowerCase().includes('productos.csv'));
    const comercioFile = directory.files.find(f => f.path.toLowerCase().includes('comercio.csv'));

    if (!comercioFile || !sucursalesFile || !productosFile) {
        console.warn(`[!] Faltan archivos CSV esperados (comercio, sucursales, productos) en el ZIP interno ${zipName}. Saltando.`);
        return;
    }

    const comerciosMap = new Map(); // Mapa temporal para guardar información de comercios
    const filteredSucursalesForThisZip = new Map(); // Mapa para sucursales que cumplen los criterios en este ZIP

    // 1. Procesar el archivo de comercios
    const comercios = await procesarCsvStream(comercioFile.stream(), `${zipName}/comercio.csv`);
    comercios.forEach(c => {
        const id_comercio = c.id_comercio;
        const comercioCuit = c.comercio_cuit || '';
        const comercioRazonSocial = c.comercio_razon_social || '';

        if (id_comercio) {
            comerciosMap.set(id_comercio, {
                comercio_razon_social: comercioRazonSocial.toLowerCase(), // Convertir a minúsculas para comparación
                comercio_bandera_nombre: c.comercio_bandera_nombre || '',
                comercio_cuit: comercioCuit
            });
        }
    });

    // 2. Procesar el archivo de sucursales
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

        // Intentar identificar la marca del comercio por CUIT o Razón Social
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

        // Si se identificó la marca del comercio, verificar la ubicación de la sucursal
        if (identifiedBrandByComercio) {
            for (const targetLocation of TARGET_SUPERMARKETS_LOCATIONS) {
                // Solo comparar con ubicaciones objetivo de la misma marca identificada
                if (targetLocation.brand === identifiedBrandByComercio) {
                    const distance = getDistance(sucursalLat, sucursalLon, targetLocation.lat, targetLocation.lon);
                    distanceToTarget = Math.min(distanceToTarget, distance);

                    // Verificar si es una coincidencia exacta por ID de sucursal (si está definida)
                    const isSpecificSucursalMatch = targetLocation.id_sucursal ? String(targetLocation.id_sucursal) === String(id_sucursal) : false;

                    // Si está dentro del umbral de distancia o es una coincidencia exacta de ID
                    if (distance <= DISTANCE_THRESHOLD || isSpecificSucursalMatch) {
                        isLocationMatch = true;
                        // Priorizar la coincidencia exacta o la menor distancia
                        if (distance < minDistanceFound || isSpecificSucursalMatch) {
                            minDistanceFound = distance;
                            bestMatchedBrand = targetLocation.brand;
                            bestMatchedLocationName = targetLocation.name;
                        }
                    }
                }
            }
        }

        // Si la sucursal coincide con nuestros criterios
        if (bestMatchedBrand && isLocationMatch) {
            console.log(`[MATCH] Sucursal ${id_sucursal} (${row.sucursal_nombre || 'N/A'}) en [${sucursalLat}, ${sucursalLon}] (Comercio: ${comercioInfo.comercio_razon_social}, CUIT: ${comercioInfo.comercio_cuit}) **COINCIDE** con '${bestMatchedLocationName}' (${bestMatchedBrand}). Distancia: ${minDistanceFound.toFixed(6)} (Umbral: ${DISTANCE_THRESHOLD})`);

            const normalizedBrand = normalizeSupermarketBrand(bestMatchedBrand);

            // Doble verificación de que la marca normalizada esté en nuestra lista de interés final
            if (!MARCAS_NORMALIZADAS_INTERES.has(normalizedBrand)) {
                console.warn(`[!] Sucursal ${id_sucursal} (Comercio: ${comercioInfo.comercio_razon_social}) coincide por ubicación y marca de comercio, pero la marca normalizada (${normalizedBrand}) no está en la lista final de marcas a guardar. Saltando.`);
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
                ultima_actualizacion: admin.firestore.FieldValue.serverTimestamp() // Agrega la marca de tiempo del servidor
            };

            const brandName = sucursalData.marca;
            if (!allFilteredSucursalesByBrand.has(brandName)) {
                allFilteredSucursalesByBrand.set(brandName, new Map());
            }
            allFilteredSucursalesByBrand.get(brandName).set(id_sucursal, sucursalData);

            filteredSucursalesForThisZip.set(id_sucursal, sucursalData); // Guardar para usar en el procesamiento de productos
        } else {
            let reason = [];
            if (!identifiedBrandByComercio) {
                reason.push(`No se identificó la marca por CUIT ('${comercioInfo.comercio_cuit}') o Razón Social ('${comercioInfo.comercio_razon_social}')`);
            } else if (!isLocationMatch) {
                reason.push(`Marca identificada (${identifiedBrandByComercio}), pero fuera del umbral de distancia (${distanceToTarget.toFixed(6)} > ${DISTANCE_THRESHOLD}) y no hay coincidencia exacta de ID de sucursal objetivo.`);
            }

            // Opcional: Descomentar para ver por qué una sucursal NO coincide
            // console.log(`[NO_MATCH] Sucursal ${id_sucursal} (${row.sucursal_nombre || 'N/A'}) @ [${sucursalLat}, ${sucursalLon}] (Comercio: ${comercioInfo.comercio_razon_social}, CUIT: ${comercioInfo.comercio_cuit}) NO coincide. Razón: ${reason.join('; ')}`);
        }
    });

    // 3. Procesar el archivo de productos para las sucursales filtradas
    if (filteredSucursalesForThisZip.size > 0) {
        console.log(`[+] Encontradas ${filteredSucursalesForThisZip.size} sucursales de interés en ${zipName}. Procesando productos...`);
        const productos = await procesarCsvStream(productosFile.stream(), `${zipName}/productos.csv`);
        productos.forEach(p => {
            const id_sucursal_producto = p.id_sucursal;
            const sucursalInfo = filteredSucursalesForThisZip.get(id_sucursal_producto); // Obtener info de la sucursal filtrada

            if (sucursalInfo) { // Si esta sucursal fue filtrada y aprobada
                const precioLista = parseFloat(p.productos_precio_lista || '0');
                const stockStatus = (precioLista > 0 && !isNaN(precioLista)); // Asume que hay stock si el precio es > 0

                const productData = {
                    id: `${p.id_producto}-${id_sucursal_producto}`, // ID único para el producto en esa sucursal
                    id_producto_original: p.id_producto, // ID del producto original para referencia
                    nombre: p.productos_descripcion || 'Producto sin descripción',
                    precio: precioLista || 0,
                    supermercado_marca: sucursalInfo.marca, // Marca normalizada de la sucursal
                    sucursal_id: sucursalInfo.id_sucursal,
                    sucursal_nombre: sucursalInfo.nombre_sucursal,
                    stock: stockStatus,
                    ean: p.productos_ean || '',
                    marca_producto: p.productos_marca || 'Sin Marca', // Marca del producto en sí
                    cantidad_presentacion: parseFloat(p.productos_cantidad_presentacion || '0') || null,
                    unidad_medida_presentacion: p.productos_unidad_medida_presentacion || '',
                    ultima_actualizacion: admin.firestore.FieldValue.serverTimestamp() // Agrega la marca de tiempo del servidor
                };

                const brandName = sucursalInfo.marca;
                const branchId = sucursalInfo.id_sucursal;

                // Almacenar el producto bajo su marca y sucursal
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

/**
 * Descarga el archivo ZIP del día desde la URL proporcionada.
 * @param {string} url - La URL de descarga del ZIP.
 * @param {string} tempFilePath - La ruta donde se guardará temporalmente el ZIP.
 * @returns {Promise<Buffer>} Una promesa que resuelve con el buffer del archivo ZIP descargado.
 */
async function downloadZipForDay(url, tempFilePath) {
    console.log(`Descargando ZIP para el día desde: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Error al descargar el ZIP: ${response.statusText} (${response.status})`);
    }
    await pipeline(response.body, fs.createWriteStream(tempFilePath)); 
    console.log(`ZIP del día descargado en ${tempFilePath}.`);
    return fsp.readFile(tempFilePath); 
}

/**
 * Sube un documento a una colección en Firestore.
 * @param {string} collectionName - El nombre de la colección.
 * @param {string} docId - El ID del documento.
 * @param {Object} data - Los datos a subir.
 */
async function uploadToFirestore(collectionName, docId, data) {
    try {
        await db.collection(collectionName).doc(docId).set(data, { merge: true }); // Usamos merge para actualizar si existe, crear si no.
        // console.log(`Documento '${docId}' subido a la colección '${collectionName}'.`);
    } catch (error) {
        console.error(`Error subiendo documento '${docId}' a '${collectionName}':`, error);
        throw error;
    }
}

/**
 * Sube una lista de documentos a Firestore en lotes (batches) para optimizar escrituras.
 * @param {string} collectionName - El nombre de la colección.
 * @param {Array<Object>} documents - Array de objetos de documentos, cada uno con un 'id' y otros datos.
 * @param {string} idField - El nombre del campo que contiene el ID único para el documento en Firestore.
 */
async function uploadBatchToFirestore(collectionName, documents, idField) {
    if (documents.length === 0) {
        return;
    }

    const BATCH_SIZE = 400; // Máximo 500 operaciones por lote en Firestore
    let batch = db.batch();
    let batchCount = 0;
    let uploadedCount = 0;

    console.log(`Iniciando subida por lotes a la colección '${collectionName}'. Total de documentos: ${documents.length}`);

    for (let i = 0; i < documents.length; i++) {
        const docData = documents[i];
        const docId = String(docData[idField]); // Aseguramos que el ID sea una cadena

        if (!docId || docId === 'undefined') {
            console.warn(`[SKIP] Documento sin ID válido en '${idField}'. Saltando documento:`, docData);
            continue;
        }

        const docRef = db.collection(collectionName).doc(docId);
        batch.set(docRef, docData, { merge: true }); // Usamos merge para actualizar/crear

        batchCount++;
        if (batchCount === BATCH_SIZE || i === documents.length - 1) {
            try {
                await batch.commit();
                uploadedCount += batchCount;
                console.log(`  Lote de ${batchCount} documentos subido a '${collectionName}'. Total subidos: ${uploadedCount}`);
                batch = db.batch(); // Reiniciar el lote
                batchCount = 0;
            } catch (error) {
                console.error(`Error al subir lote a la colección '${collectionName}'. Total de documentos procesados antes del error: ${i + 1}.`, error);
                throw error; // Propagar el error para que la función principal lo capture
            }
        }
    }
    console.log(`Subida por lotes a '${collectionName}' finalizada. Documentos subidos: ${uploadedCount}.`);
}


/**
 * Función principal que orquesta el proceso de descarga, filtrado y generación de JSONs y subida a Firestore.
 */
async function generarJsonFiltradosYSubirAFirestore() {
    try {
        console.log('Iniciando proceso de filtrado, generación de JSONs y subida a Firestore...');

        const today = new Date();
        const dayOfWeek = today.getDay(); // Obtiene el día de la semana (0 = Domingo, 1 = Lunes, etc.)
        const currentDayZipUrl = DAILY_URLS[dayOfWeek]; // Selecciona la URL correspondiente al día

        if (!currentDayZipUrl) {
            throw new Error(`No se encontró URL de descarga para el día de la semana actual (${dayOfWeek}). Por favor, verifica la constante DAILY_URLS.`);
        }

        console.log(`URL de descarga para hoy (día ${dayOfWeek}): ${currentDayZipUrl}`);
        
        // Descargar el ZIP principal del día
        const bufferZip = await downloadZipForDay(currentDayZipUrl, tempZipPath);

        console.log('Descomprimiendo ZIP principal...');
        const directory = await unzipper.Open.buffer(bufferZip); // Abrir el ZIP principal en memoria

        // Filtrar los ZIPs internos basándose en sus prefijos (sin la fecha/hora)
        let zipsInternos = directory.files.filter(f => {
            const fileName = path.basename(f.path); // Obtener solo el nombre del archivo del path completo
            if (!fileName.toLowerCase().endsWith('.zip')) {
                return false; // Asegurarse de que sea un archivo .zip
            }
            // Obtener el nombre del archivo sin la extensión para la comparación con el prefijo
            const fileNameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'));
            for (const prefix of KNOWN_ZIPS_TO_PROCESS_PREFIXES) {
                if (fileNameWithoutExt.startsWith(prefix)) {
                    return true; // Coincide con uno de los prefijos deseados
                }
            }
            return false; // No coincide con ningún prefijo
        });

        if (zipsInternos.length === 0) {
            console.error('No se encontraron ZIPs internos con los prefijos especificados para procesar.');
            const allFoundZips = directory.files.filter(f => f.path.toLowerCase().endsWith('.zip')).map(f => path.basename(f.path));
            console.log('ZIPs internos encontrados en el archivo principal (sin filtrar por prefijo):', allFoundZips);
            process.exit(1); // Salir si no hay ZIPs relevantes
        }

        console.log(`Encontrados ${zipsInternos.length} ZIPs internos especificados para procesar.`);
        console.log('Listando ZIPs internos que serán procesados:');
        zipsInternos.forEach(zip => console.log(`- ${zip.path}`));

        // Mapas para almacenar los datos filtrados antes de escribirlos a JSON y subir a Firestore
        const allFilteredSucursalesByBrand = new Map(); // Marca -> Map<id_sucursal, sucursalData>
        const allProductsByBranch = new Map(); // Marca -> Map<id_sucursal, Array<productData>>

        // Iterar y procesar cada ZIP interno encontrado
        for (const zip of zipsInternos) {
            console.log(`Procesando ZIP interno: ${zip.path}`);
            try {
                const bufferZipInterno = await zip.buffer(); // Leer el ZIP interno como un buffer
                await procesarZipInterno(bufferZipInterno, allFilteredSucursalesByBrand, allProductsByBranch, path.basename(zip.path)); 
            } catch (innerZipError) {
                console.error(`Error al extraer o procesar el ZIP interno ${zip.path}. Saltando al siguiente ZIP.`, innerZipError);
            }
        }

        console.log('\nTodos los ZIPs internos procesados.');
        console.log('Generando archivos JSON locales y subiendo datos a Firestore...');

        // --- Generar archivos JSON de sucursales ---
        const baseSuperDir = path.join(__dirname, '../src/data/super');
        await fsp.mkdir(baseSuperDir, { recursive: true });
        console.log(`Carpeta base de sucursales '${baseSuperDir}' creada/verificada.`);

        let totalUniqueSucursales = 0;
        let allSucursalesForFirestore = [];

        console.log(`Escribiendo archivos JSON de sucursales (uno por marca) en 'src/data/super/' y preparando para Firestore...`);
        for (const [brandName, sucursalesMap] of allFilteredSucursalesByBrand.entries()) {
            if (MARCAS_NORMALIZADAS_INTERES.has(brandName)) {
                const safeBrandName = brandName.replace(/[^a-z0-9]/gi, '').toLowerCase();
                const branchFilename = path.join(baseSuperDir, `${safeBrandName}.json`);
                const sucursalesList = Array.from(sucursalesMap.values());
                await writeToJson(sucursalesList, branchFilename);
                totalUniqueSucursales += sucursalesList.length;
                allSucursalesForFirestore.push(...sucursalesList); // Recopila todas las sucursales para subida por lotes
            } else {
                console.log(`Saltando escritura para marca no deseada: ${brandName}`);
            }
        }
        console.log(`Total de sucursales únicas encontradas: ${totalUniqueSucursales}`);

        // --- Subir sucursales a Firestore ---
        console.log('\n--- Subiendo sucursales a Firestore ---');
        // Usaremos una colección 'supermercados' y un subcolección 'sucursales' para cada marca
        for (const [brandName, sucursalesMap] of allFilteredSucursalesByBrand.entries()) {
            if (MARCAS_NORMALIZADAS_INTERES.has(brandName)) {
                const safeBrandName = brandName.replace(/[^a-z0-9]/gi, '').toLowerCase();
                const collectionPath = `supermercados/${safeBrandName}/sucursales`;
                const sucursalesList = Array.from(sucursalesMap.values());
                if (sucursalesList.length > 0) {
                    await uploadBatchToFirestore(collectionPath, sucursalesList, 'id_sucursal');
                } else {
                    console.log(`No hay sucursales para subir para la marca: ${brandName}`);
                }
            }
        }
        console.log('Subida de sucursales a Firestore finalizada.');

        // --- Generar archivos JSON de productos y subir a Firestore ---
        const baseProductsDir = path.join(__dirname, '../src/data/products');
        await fsp.mkdir(baseProductsDir, { recursive: true });
        console.log(`Carpeta base de productos '${baseProductsDir}' creada/verificada.`);

        let totalProductsFilesWritten = 0;
        let totalProductsUploaded = 0;

        console.log(`Escribiendo archivos JSON de productos (por marca y sucursal) y subiendo a Firestore...`);
        for (const [brandName, branchesMap] of allProductsByBranch.entries()) {
            if (MARCAS_NORMALIZADAS_INTERES.has(brandName)) {
                const safeBrandName = brandName.replace(/[^a-z0-9]/gi, '').toLowerCase();
                const brandDir = path.join(baseProductsDir, safeBrandName);
                await fsp.mkdir(brandDir, { recursive: true });
                console.log(`     Creando directorio para marca: ${brandName}`);

                for (const [branchId, productsList] of branchesMap.entries()) {
                    // Escribir a JSON local
                    const productFilename = path.join(brandDir, `${branchId}.json`);
                    await writeToJson(productsList, productFilename);
                    totalProductsFilesWritten++;

                    // Subir a Firestore
                    const collectionPath = `supermercados/${safeBrandName}/sucursales/${branchId}/productos`;
                    if (productsList.length > 0) {
                        await uploadBatchToFirestore(collectionPath, productsList, 'id'); // 'id' es el ID único del producto para Firestore
                        totalProductsUploaded += productsList.length;
                    }
                }
            } else {
                console.log(`Saltando escritura y subida de productos para marca no deseada: ${brandName}`);
            }
        }

        console.log(`\nGeneración de JSONs finalizada. Total de archivos de productos escritos: ${totalProductsFilesWritten}.`);
        console.log(`Total de productos únicos subidos a Firestore: ${totalProductsUploaded}.`);
        console.log('Puedes revisar los archivos JSON en src/data/super/ y src/data/products/.');
        console.log('También puedes verificar los datos en tu consola de Firebase Firestore.');

        process.exit(0); // Terminar el proceso con éxito

    } catch (error) {
        console.error('\nError crítico en el proceso:', error);
        process.exit(1); // Terminar el proceso con error
    } finally {
        // Limpiar el archivo ZIP temporal al finalizar o en caso de error
        try {
            await fsp.unlink(tempZipPath);
            console.log(`Archivo ZIP temporal eliminado: ${tempZipPath}`);
        } catch (unlinkError) {
            // Ignorar errores si el archivo no existía (ej. nunca se descargó correctamente)
            if (unlinkError.code !== 'ENOENT') {
                console.warn(`No se pudo eliminar el archivo temporal ${tempZipPath}:`, unlinkError);
            }
        }
    }
}

// Iniciar la ejecución de la función principal
generarJsonFiltradosYSubirAFirestore();