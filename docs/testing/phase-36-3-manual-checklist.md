# Fase 36.3 - Checklist manual de pruebas

## Objetivo
Recuperar el lector al volver desde segundo plano sin reconstruirlo cuando sigue sano.

## Alcance
- Señales `visibilitychange`, `pageshow` (incluido BFCache), `focus` y `online`.
- Comprobacion de salud barata, solo DOM y API publica.
- Reconstruccion reutilizando el coordinador de la Fase 36.2 y el acceso de la 36.1.
- Restauracion de la ultima posicion estable de la sesion.

## Fuera de alcance
IndexedDB, Service Worker, lectura offline, precarga, prefetch y sincronizacion entre pestañas.

## Precondiciones
1. `npm run dev` (los logs `[reader-recovery]` solo salen fuera de produccion).
2. Un libro con progreso y con alguna traduccion persistente.
3. Consola abierta filtrando por `[reader-recovery]`.

## Como simular una instancia rota
Una pestaña suspendida deja el iframe sin documento o vacio. Se reproduce desde la consola:

```js
document.querySelector("iframe").contentDocument.body.innerHTML = "";
document.dispatchEvent(new Event("visibilitychange"));
```

Para simular BFCache:

```js
window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
```

## Casos

### Caso 1 - Regreso con lector sano
1. Abrir un libro y cambiar de aplicacion unos segundos.
2. Volver.
3. Consola: `FOREGROUND_ENTERED` > `HEALTH_CHECK_STARTED` > `HEALTHY`.
4. No aparece loader, no se pide signed URL y la posicion es la misma.

### Caso 2 - Segundo plano prolongado
1. Dejar la aplicacion en segundo plano varios minutos.
2. Volver y comprobar que sigue funcionando o se recupera manteniendo la posicion.

### Caso 3 - Regreso con lector roto
1. Romper el iframe con el snippet de arriba.
2. Consola: `RECOVERY_REQUIRED` > `RECOVERY_STARTED` > `RECOVERY_SUCCEEDED`.
3. Se pide **una** signed URL nueva y se crea **una** rendition.
4. El libro reaparece en la posicion en la que se estaba leyendo, no al principio.

### Caso 4 - Varias entradas y salidas
Entrar y salir repetidamente. No deben aparecer varias renditions, varios loaders,
saltos de posicion ni peticiones repetidas a Storage.

### Caso 5 - BFCache
1. Navegar a otra pagina y volver con el boton atras.
2. Consola: `BFCACHE_RESTORED` y despues `HEALTHY` si la instancia sobrevivio.

### Caso 6 - Perdida de red con lector sano
1. Desactivar la red, cambiar de aplicacion y volver.
2. El libro sigue leyendose y no se pide acceso.

### Caso 7 - Perdida de red con lector roto
1. Sin red, romper el iframe y volver a primer plano.
2. Consola: `OFFLINE_RECOVERY_DEFERRED`. No hay bucle ni peticiones.
3. Recuperar la conexion: un unico intento y vuelve la posicion.

### Caso 8 - Sesion caducada durante la reconstruccion
1. Borrar las cookies de sesion, romper el iframe y volver a primer plano.
2. Mensaje: `Your session has expired. Please sign in again.`
3. No aparece el mensaje de EPUB invalido ni se entra en bucle.

### Caso 9 - Traducciones y resaltados
1. Con traducciones guardadas, romper el iframe y recuperar.
2. Los resaltados vuelven, sin duplicarse.
3. Pulsar uno muestra la traduccion guardada sin llamar a la IA.

### Caso 10 - Tema y tamaño
Cambiar tema y tamaño, salir y volver: deben conservarse.

### Caso 11 - Movil real
Bloqueo y desbloqueo de pantalla, cambio de aplicacion, regreso desde recientes,
cambio de orientacion y segundo plano prolongado.

### Caso 12 - Regresion
Repetir los checklists de las fases 36.1 y 36.2.

## Limitacion conocida
Si el sistema operativo descarta la pestaña por completo, JavaScript no conserva nada y
al volver se produce una carga normal de la ruta: signed URL nueva, progreso desde
Supabase y traducciones recuperadas. Resolver eso requeriria almacenamiento persistente,
que queda fuera de esta fase.
