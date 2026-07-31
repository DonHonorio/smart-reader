# Fase 35 - Checklist manual de pruebas

## Objetivo
Validar traducciones persistentes ancladas a posiciones EPUB (CFI) y su resaltado en el lector.

## Alcance
- Tabla `book_translations` y su RLS.
- Enlace `vocabulary_items.book_translation_id`.
- Captura del CFI del rango seleccionado.
- Resaltado persistente y su restauracion.
- Panel en estados `new_translation`, `stored_translation` y `saved_vocabulary`.

## Precondiciones
1. Migracion aplicada: `supabase/migrations/20260731000000_book_translations.sql`.
2. Proveedor de IA configurado (`AI_PROVIDER` + su API key).
3. Usuario de prueba con al menos un EPUB subido y legible.
4. Aplicacion en `npm run dev` (los logs `[book-translation]` solo salen fuera de produccion).

## Consultas de verificacion (SQL)

```sql
-- Traducciones persistentes del libro
select id, cfi_range, chapter_href, selected_text, translation, target_language, created_at
from public.book_translations
where book_id = 'BOOK_ID_TEST'
order by created_at desc;

-- Vocabulario enlazado
select v.id, v.term, v.book_translation_id, t.cfi_range
from public.vocabulary_items v
left join public.book_translations t on t.id = v.book_translation_id
where v.book_id = 'BOOK_ID_TEST'
order by v.created_at desc;
```

## Casos

### Caso 1 - Primera traduccion
1. Abrir un libro y seleccionar una palabra nueva.
2. Pulsar `Translate`.
3. Consola: `[book-translation] AI_REQUIRED`, luego `HIGHLIGHT_APPLIED` y `SAVED`.
4. El rango queda resaltado en rosa sin pulsar `Save`.
5. La fila existe en `book_translations` con `cfi_range` y `chapter_href`.

### Caso 2 - Persistencia entre sesiones
1. Volver a la biblioteca y reabrir el libro.
2. Al renderizarse el capitulo, la palabra sigue resaltada.
3. No debe aparecer ninguna llamada a `/api/translate` en la pestana Network.

### Caso 3 - Pulsar el resaltado
1. Pulsar (o tocar en movil) el texto resaltado.
2. Se abre el panel con selected text, contexto, expresion detectada y traduccion.
3. Consola: `[book-translation] FOUND`. Sin peticion a `/api/translate`.
4. En movil, el tap no debe alternar la barra superior/inferior del lector.

### Caso 4 - Misma palabra en otra frase
1. Traducir la misma palabra en otro parrafo.
2. Debe crearse una segunda fila con distinto `cfi_range`.
3. Ambos rangos quedan resaltados de forma independiente.

### Caso 5 - Frase completa
1. Seleccionar una frase de varias palabras y traducirla.
2. Todo el rango queda resaltado, no solo la primera palabra.
3. Reabrir el libro y comprobar que se restaura completo.

### Caso 6 - Cambios de presentacion
1. Cambiar tamano de texto, tema (light/sepia/dark), orientacion y ancho de ventana.
2. El resaltado sigue sobre el mismo texto en una y en dos paginas.
3. En dark el resaltado sigue siendo visible y el texto legible.

### Caso 7 - Guardar en vocabulario
1. Con el panel abierto, pulsar `Save`.
2. Se crea `vocabulary_items` con `book_translation_id` apuntando a la traduccion.

### Caso 8 - Guardar dos veces
1. Cerrar el panel, volver a pulsar el resaltado y pulsar `Save` otra vez.
2. El boton muestra `Already saved` y no se crea una segunda fila.

### Caso 9 - Aislamiento entre usuarios
1. Entrar con otro usuario y abrir su propio libro.
2. `select * from public.book_translations` desde ese usuario no devuelve filas del primero.

### Caso 10 - Fallo de persistencia
1. Simular el fallo (por ejemplo, renombrar temporalmente la tabla o cortar la red tras la respuesta de IA).
2. La traduccion sigue mostrandose en el panel.
3. Consola: `[book-translation] SAVE_FAILED`.
4. No aparece `Could not translate text right now.`.
5. El resaltado se mantiene durante la sesion, pero no reaparece tras reabrir el libro.

## Regresiones a comprobar
1. Swipe movil sigue funcionando al pasar pagina.
2. La seleccion nativa de texto sigue funcionando sobre texto ya resaltado.
3. El progreso de lectura se sigue guardando (`reading_progress`).
4. Exportacion CSV a Anki sin cambios.
