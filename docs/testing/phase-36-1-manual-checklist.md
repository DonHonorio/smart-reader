# Fase 36.1 - Checklist manual de pruebas

## Objetivo
Eliminar los falsos errores de "EPUB invalido" causados por signed URLs temporales caducadas,
reutilizadas o invalidas al abrir el lector.

## Alcance
- Endpoint `GET /api/books/access` (signed URL nueva a partir de `books.file_path`).
- Errores estructurados por causa (`BookAccessErrorCode`).
- Un unico reintento automatico con una signed URL nueva.
- Proteccion contra respuestas antiguas (id incremental de intento + `AbortController`).

## Fuera de alcance (fases 36.2 y 36.3)
- Refactor del ciclo de vida de `epub.js`.
- Recuperacion por `visibilitychange`, `pageshow` o vuelta desde segundo plano.
- Precarga, cache persistente, IndexedDB o Service Worker.

## Precondiciones
1. Aplicacion en `npm run dev` (los logs `[book-access]` solo salen fuera de produccion).
2. Usuario de prueba con al menos un EPUB subido y legible (`books.status = 'uploaded'`).
3. DevTools abierto en la pestana Console y Network.

## Como simular cada fallo

- **Fallo en los dos intentos (Caso 3):** `Ctrl+Shift+P` > `Show Network request blocking` y
  anadir el patron `*/storage/v1/object/sign/*`. Despues **recargar** la pagina del lector.
  No usar `Block request URL` con el boton derecho: guarda la URL completa con su `token`, y
  cada carga pide una signed URL nueva con otro token, asi que el patron nunca vuelve a
  coincidir. El patron tampoco debe alcanzar a `/api/books/access`.
- **Fallo solo en el primer intento (Caso 2):** DevTools no sabe fallar un intento si y el
  siguiente no. Parchear temporalmente el bucle `loadEpubData` de
  `src/components/reader/EpubReader.tsx`, en la llamada a `downloadEpubFromSignedUrl`:
  `signedUrl: attempt === 1 ? `${accessResult.grant.signedUrl}x` : accessResult.grant.signedUrl`.
  La `x` invalida la firma del token, Storage responde 400 `InvalidJWT` y el reintento usa la
  URL buena. **Revertir el parche al terminar.**
- **Archivo inexistente:** borrar el objeto del bucket `books` desde el panel de Supabase
  dejando la fila de `books` intacta.
- **Sesion caducada:** borrar las cookies `sb-*` con la pestana del lector ya abierta y pulsar
  `Try again` (entrar sin sesion redirige a `/login` por middleware, que tambien es correcto).
- **EPUB corrupto:** subir un `.zip` renombrado a `.epub` o truncar un EPUB valido.

## Casos

### Caso 1 - Funcionamiento normal
1. Abrir un libro existente desde `Library`.
2. Network: aparece `GET /api/books/access?bookId=...` con respuesta 200 y `signedUrl`.
3. Consola: `REQUESTING_SIGNED_URL` -> `SIGNED_URL_CREATED` -> `EPUB_LOAD_STARTED`.
4. El EPUB se abre y no aparece `ACCESS_RETRY_STARTED`.

### Caso 2 - URL invalida en el primer intento
1. Simular 403 o firma invalida solo para la primera descarga.
2. Consola: `ACCESS_RETRY_STARTED` seguido de `REQUESTING_SIGNED_URL` (attempt 2).
3. Network: se pide una signed URL nueva (distinta de la primera).
4. Consola: `ACCESS_RETRY_SUCCEEDED` y el libro se abre.
5. No se muestra ningun mensaje de error al usuario; la pantalla de carga no parpadea.

### Caso 3 - Segundo intento fallido
1. Bloquear todas las descargas del objeto de Storage.
2. Consola: exactamente dos `REQUESTING_SIGNED_URL` y luego `ACCESS_RETRY_FAILED`.
3. No hay mas peticiones (sin bucle).
4. Mensaje: `The book could not be loaded right now. Please try again.`
5. `Try again` inicia un ciclo nuevo (dos intentos como maximo).

### Caso 4 - Archivo inexistente en Storage
1. Borrar el objeto del bucket manteniendo la fila en `books`.
2. Consola: `STORAGE_FILE_NOT_FOUND`.
3. Mensaje: `The EPUB file could not be found. Please upload the book again.`
4. No aparece el mensaje de EPUB invalido y no hay reintento en bucle.

### Caso 5 - Sesion caducada
1. Con el lector abierto, borrar las cookies de sesion y pulsar `Try again`.
2. `GET /api/books/access` responde 401 con `code: UNAUTHENTICATED`.
3. No se intenta descargar el EPUB ni se reintenta.
4. Mensaje: `Your session has expired. Please sign in again.`

### Caso 6 - EPUB realmente corrupto
1. Abrir un libro cuyo objeto no sea un EPUB valido.
2. La descarga responde 200, por lo que no hay reintento de acceso.
3. Consola: `EPUB_LOAD_STARTED` y despues `EPUB_INVALID`.
4. Mensaje: `The EPUB file could not be opened. Please upload a valid .epub file.`

### Caso 7 - Peticiones fuera de orden
1. En Network conditions aplicar throttling agresivo y abrir el lector.
2. Antes de que termine, navegar a `Library` y volver a entrar al mismo libro.
3. La respuesta antigua no muestra error ni sustituye al lector nuevo.
4. Solo queda una instancia de `epub.js` activa (un unico iframe en el contenedor).

### Caso 8 - Timeout
1. Throttling `Offline` justo despues de cargar la pagina del lector.
2. Tras el presupuesto de carga: `The book is taking too long to load. Please try again.`
3. No aparece el mensaje de EPUB invalido.

### Caso 9 - Regresion
Con un libro normal, comprobar que siguen funcionando:
- restauracion del progreso guardado;
- cambio de pagina (botones y teclado);
- seleccion de texto y panel de traduccion;
- traducciones persistentes y resaltados;
- guardado en vocabulario;
- swipe en movil;
- cambio de tema;
- cambio de tamano de texto.

## Comprobacion de privacidad de los logs
En la consola, ningun log `[book-access]` debe contener signed URLs, tokens, cookies ni texto
del libro. Solo `bookId`, codigo de error, numero de intento y duracion.
