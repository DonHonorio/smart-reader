# Fase 37 - Checklist manual de pruebas

## Objetivo
Guardar vocabulario sin que la interfaz espere a Supabase: el boton pasa a `Saved` en la
pulsacion y la escritura ocurre despues.

## Alcance
- Estado optimista del boton `Save` en el panel de seleccion.
- Reversion a `Save` cuando la escritura falla, sin tocar traduccion ni resaltado.
- Proteccion contra dobles pulsaciones y contra respuestas antiguas.
- Idempotencia del endpoint `/api/vocabulary` cuando llega `bookTranslationId`.

## Fuera de alcance
Cola persistente, Service Worker, IndexedDB, reintentos automaticos, guardado offline,
edicion o borrado de vocabulario y rediseño del panel.

## Limitacion conocida
"Guardar en segundo plano" significa que la interfaz no espera la respuesta, no que la
peticion este garantizada. Si la pestaña se cierra justo despues de pulsar `Save`, el
navegador puede abortarla y la fila no se creara. No hay cola persistente ni reintentos:
al volver a abrir el resaltado se vera `Save` otra vez y bastara con pulsarlo.

## Precondiciones
1. `npm run dev` (los logs `[vocabulary-save]` solo salen fuera de produccion).
2. Un libro con alguna traduccion ya persistida.
3. Consola abierta filtrando por `[vocabulary-save]`.

## Casos

### Caso 1 - Guardado normal
1. Abrir un libro, seleccionar una palabra y traducirla.
2. Pulsar `Save`.
3. El boton muestra `Saved` al instante y queda desactivado.
4. Consola: `OPTIMISTIC_UPDATE` > `REQUEST_STARTED` > `SAVED`.
5. La fila aparece en `vocabulary_items` con `book_translation_id` relleno.

### Caso 2 - Conexion lenta
1. DevTools > Network > perfil `Slow 3G`.
2. Pulsar `Save`.
3. El cambio a `Saved` es inmediato, sin esperar a la respuesta.
4. Pasar pagina y seleccionar otro texto mientras la peticion sigue viva: el lector
   responde con normalidad.

### Caso 3 - Error de red
1. DevTools > Network > `Offline`.
2. Pulsar `Save`: primero aparece `Saved`.
3. Al fallar vuelve a `Save`, habilitado, con el mensaje
   `Could not save this vocabulary item. Please try again.`
4. Consola: `FAILED` y `ROLLBACK`. El panel no se cierra y el resaltado sigue.
5. Volver a la red y pulsar `Save` otra vez: se guarda.

### Caso 4 - Doble clic
1. Pulsar `Save` cinco o seis veces seguidas lo mas rapido posible.
2. Network: una sola peticion `POST /api/vocabulary`.
3. Consola: `DUPLICATE_CLICK_IGNORED` en las pulsaciones sobrantes.
4. En la base de datos hay una sola fila.

### Caso 5 - Reabrir el resaltado
1. Guardar una palabra.
2. Cerrar el panel tocando fuera de la seleccion.
3. Pulsar de nuevo el resaltado: el panel abre con `Saved` y sin ninguna peticion nueva.

### Caso 6 - Recargar el lector
1. Guardar una palabra y salir del libro.
2. Volver a entrar y pulsar el resaltado.
3. Muestra `Saved` directamente, sin llamar a la IA ni insertar nada.

### Caso 7 - Fallo de vocabulario
1. DevTools > Network > bloquear el patron `*/api/vocabulary*`.
2. Pulsar `Save`.
3. Tras el error se conservan traduccion, resaltado, posicion y lector operativo.
4. La fila de `book_translations` sigue existiendo.

### Caso 8 - Varias traducciones
1. Traducir dos palabras distintas.
2. Guardar la primera y, sin esperar, abrir la segunda.
3. Cada una mantiene su propio estado: la respuesta de la primera no cambia la segunda.

### Caso 9 - Cerrar el panel durante el guardado
1. Con `Slow 3G`, pulsar `Save` y cerrar el panel de inmediato.
2. La peticion termina igualmente.
3. Al reabrir el resaltado aparece `Saved`.

### Caso 10 - Movil
1. Emular un movil (o usar un telefono real).
2. Pulsacion rapida, cerrar el panel mientras guarda, swipe mientras guarda.
3. Cambiar de aplicacion y volver: el resaltado sigue marcado como guardado.

### Caso 11 - Sesion caducada
1. Borrar las cookies de sesion desde DevTools sin recargar.
2. Pulsar `Save`.
3. Vuelve a `Save` con el mensaje `Your session has expired. Please sign in again.`
4. La traduccion y el resaltado siguen intactos.

### Caso 12 - Regresion del lector
Comprobar carga inicial, progreso, cambio de pagina, swipe, seleccion, traducciones
persistentes, resaltados y recuperacion desde segundo plano.

## Bateria automatica
`phase37.js` del arnes de Playwright cubre los doce tests de la fase (48 comprobaciones)
interceptando `/api/translate` para no gastar llamadas de IA. Las pruebas de idempotencia,
concurrencia y traduccion ajena atacan el endpoint real con `context.request`, que no pasa
por el interceptor.
