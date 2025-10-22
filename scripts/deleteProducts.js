const admin = require('firebase-admin');

// --- CONFIGURACIÓN ---
// Reemplaza con la ruta a tu archivo de Service Account de Firebase.
// Asegúrate de que este archivo no se suba a repositorios públicos.
const serviceAccount = require('./serviceAccountKey.json'); 

// Inicializa Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Define el patrón de terminación que quieres eliminar
const SUFIX_TO_DELETE = '_changomas_1004';

// Define las colecciones donde buscar los productos.
// Si tus productos están bajo colecciones anidadas, como:
// /supermercados/{marca}/sucursales/{idSucursal}/productos
// Deberás ajustar el script para iterar por estas marcas y sucursales.
// Para este ejemplo, asumiremos que sabes la ruta exacta si está anidada.
// Si tienes múltiples marcas o IDs de sucursal, los definirás aquí.

// Ejemplo 1: Si los productos están en una colección directa, por ejemplo:
// const COLLECTION_NAME = 'todos_mis_productos'; 
// const productCollectionRef = db.collection(COLLECTION_NAME);

// Ejemplo 2: Si están anidados como en tu descripción (supermercados/{marca}/sucursales/{idSucursal}/productos)
// Necesitas especificar la marca y el ID de sucursal para construir la ruta.
// ADVERTENCIA: Este script solo procesa UNA combinación de marca y sucursal.
// Si tienes productos con este sufijo en múltiples sucursales/marcas,
// deberás adaptar la lógica para iterar sobre ellas.

const COLLECTION_SUPERMERCADOS = 'supermercados';
const MARCA = 'changomas'; // Ajusta esto si el ID tiene otra marca
const SUBCOLLECTION_SUCURSALES = 'sucursales';
const ID_SUCURSAL = '1004'; // El ID de sucursal real que contiene los productos

const productCollectionRef = db.collection(COLLECTION_SUPERMERCADOS)
                               .doc(MARCA)
                               .collection(SUBCOLLECTION_SUCURSALES)
                               .doc(ID_SUCURSAL)
                               .collection('productos'); // Esta es la colección donde buscar los productos

// --- FUNCIONES DE AYUDA ---

/**
 * Elimina un lote de documentos de Firestore.
 * @param {Array<string>} docIds - Array de IDs de documentos a eliminar.
 * @param {FirebaseFirestore.CollectionReference} collectionRef - Referencia a la colección.
 * @returns {Promise<void>}
 */
async function deleteBatch(docIds, collectionRef) {
    if (docIds.length === 0) {
        return;
    }
    const batch = db.batch();
    docIds.forEach(id => {
        batch.delete(collectionRef.doc(id));
    });

    try {
        await batch.commit();
        console.log(`  Lote de ${docIds.length} documentos eliminados exitosamente.`);
    } catch (error) {
        console.error(`  Error al eliminar lote de documentos:`, error);
        throw error; // Propaga el error para detener el proceso si es crítico
    }
}

/**
 * Función principal para encontrar y eliminar documentos.
 */
async function cleanProductIdsWithSuffix() {
    console.log(`Iniciando la búsqueda y eliminación de IDs de productos que terminan con '${SUFIX_TO_DELETE}'...`);
    console.log(`Buscando en la colección: ${productCollectionRef.path}`);

    let documentsToDelete = [];
    const batchSize = 500; // Máximo para un batch de Firestore

    try {
        let lastDoc = null;
        let query;
        let totalDeletedCount = 0;

        do {
            query = productCollectionRef.orderBy(admin.firestore.FieldPath.documentId()).limit(batchSize);
            if (lastDoc) {
                query = query.startAfter(lastDoc);
            }

            const snapshot = await query.get();
            if (snapshot.empty) {
                break; // No hay más documentos
            }

            lastDoc = snapshot.docs[snapshot.docs.length - 1]; // Último documento del lote para paginación

            const idsInCurrentBatch = [];
            snapshot.forEach(doc => {
                if (doc.id.endsWith(SUFIX_TO_DELETE)) {
                    idsInCurrentBatch.push(doc.id);
                }
            });

            if (idsInCurrentBatch.length > 0) {
                console.log(`  Encontrados ${idsInCurrentBatch.length} IDs para eliminar en este lote.`);
                await deleteBatch(idsInCurrentBatch, productCollectionRef);
                totalDeletedCount += idsInCurrentBatch.length;
            } else {
                console.log('  Ningún ID coincidente en este lote.');
            }

            // Una pequeña pausa para evitar golpear los límites de cuota
            await new Promise(resolve => setTimeout(resolve, 200)); 

        } while (true); // Continuar hasta que no haya más documentos

        console.log(`\nProceso completado. Total de documentos eliminados: ${totalDeletedCount}`);

    } catch (error) {
        console.error(`\nError crítico durante el proceso de eliminación:`, error);
        process.exit(1);
    } finally {
        console.log('Finalizando el script.');
    }
}

// Ejecutar la función principal
cleanProductIdsWithSuffix();