# Fase 17 - Checklist manual de pruebas

## Objetivo
Validar y endurecer Stripe Checkout + sistema de creditos sin agregar nuevas features.

## Alcance
- Endpoint de checkout.
- Metadata enviada a Stripe.
- Endpoint de webhook.
- Idempotencia en acreditacion de creditos.
- UI de Billing (mensajes, estados de carga y error).
- Seguridad de secretos server-side.

## Precondiciones
1. Variables de entorno configuradas en servidor:
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET
- SUPABASE_SERVICE_ROLE_KEY
- NEXT_PUBLIC_APP_URL
2. Aplicacion corriendo en local o entorno de prueba.
3. Usuario de prueba existente y con acceso al area privada.
4. Stripe CLI instalado y autenticado.
5. Listener Stripe activo hacia el webhook:

```powershell
stripe listen --forward-to http://localhost:3000/api/stripe/webhook
```

## Datos de prueba
1. Usuario de prueba: USER_ID_TEST.
2. Packs validos esperados:
- single_credit
- basic_pack
- avid_reader_pack
3. Balance inicial registrado manualmente como B0.

## Consultas de verificacion (SQL)

```sql
-- Balance actual
select user_id, balance
from user_credits
where user_id = 'USER_ID_TEST';
```

```sql
-- Transacciones recientes
select id, user_id, type, amount, reason, stripe_session_id, created_at
from credit_transactions
where user_id = 'USER_ID_TEST'
order by created_at desc
limit 20;
```

```sql
-- Duplicados por stripe_session_id (debe devolver 0 filas)
select stripe_session_id, count(*) as total
from credit_transactions
where stripe_session_id is not null
group by stripe_session_id
having count(*) > 1;
```

## Checklist

### C01 - Usuario sin sesion no puede crear checkout
Pasos:
1. Cerrar sesion.
2. Ejecutar request al endpoint de checkout con pack valido.

```powershell
$body = @{ packId = "basic_pack"; credits = 999; priceCents = 1 } | ConvertTo-Json
$response = Invoke-WebRequest -Uri "http://localhost:3000/api/stripe/checkout" -Method Post -ContentType "application/json" -Body $body -SkipHttpErrorCheck -StatusCodeVariable status
$status
$response.Content
```

Resultado esperado:
1. HTTP 401.
2. Mensaje de error de autenticacion.
3. No se crea checkout session.
4. No cambia user_credits.

### C02 - packId invalido en checkout
Pasos:
1. Iniciar sesion.
2. Enviar packId falso.

```powershell
$body = @{ packId = "fake_pack"; credits = 999; priceCents = 1 } | ConvertTo-Json
$response = Invoke-WebRequest -Uri "http://localhost:3000/api/stripe/checkout" -Method Post -ContentType "application/json" -Body $body -SkipHttpErrorCheck -StatusCodeVariable status
$status
$response.Content
```

Resultado esperado:
1. HTTP 400.
2. Error indicando packId invalido.
3. No se crea checkout session.
4. No se modifica balance.

### C03 - Tampering del cliente (credits/priceCents) es ignorado
Pasos:
1. Iniciar sesion.
2. Enviar body con packId valido y valores falsos en credits/priceCents.
3. Completar checkout.
4. Revisar en Stripe que el monto cobrado corresponde al pack real del servidor.

Resultado esperado:
1. El backend ignora credits y priceCents del cliente.
2. Stripe usa priceCents de CREDIT_PACKS del servidor.
3. Los creditos acreditados corresponden al pack del servidor.

### C04 - Firma webhook invalida
Pasos:
1. Llamar webhook con firma falsa.

```powershell
$payload = '{"id":"evt_fake","type":"checkout.session.completed","data":{"object":{"id":"cs_fake","metadata":{"userId":"u1","packId":"basic_pack"}}}}'
$response = Invoke-WebRequest -Uri "http://localhost:3000/api/stripe/webhook" -Method Post -Headers @{ "stripe-signature" = "t=1,v1=firma_falsa" } -ContentType "application/json" -Body $payload -SkipHttpErrorCheck -StatusCodeVariable status
$status
$response.Content
```

Resultado esperado:
1. HTTP 400.
2. Error de firma invalida.
3. No hay cambios en user_credits ni credit_transactions.

### C05 - Evento no relevante se ignora
Pasos:
1. Disparar un evento distinto a checkout.session.completed.

```powershell
stripe trigger payment_intent.succeeded
```

Resultado esperado:
1. Webhook responde 200.
2. Evento ignorado.
3. No cambia balance.

### C06 - Metadata incompleta en checkout.session.completed
Pasos:
1. Disparar evento generico de checkout por Stripe CLI (sin metadata de app).

```powershell
stripe trigger checkout.session.completed
```

Resultado esperado:
1. Webhook responde 200 (ignorado para evitar reintentos infinitos).
2. Se loguea metadata invalida/faltante.
3. No se acreditan creditos.

### C07 - Compra cancelada no suma creditos
Pasos:
1. Estando autenticado, ir a Billing.
2. Elegir pack y entrar al checkout.
3. Cancelar en Stripe.
4. Volver a Billing.

Resultado esperado:
1. URL contiene checkout=cancelled.
2. Se muestra mensaje exacto: "Checkout cancelled. No credits were added."
3. Balance permanece en B0.
4. No se inserta transaccion purchase.

### C08 - Compra valida suma creditos una sola vez
Pasos:
1. Estando autenticado, comprar un pack valido.
2. Completar pago de prueba.
3. Esperar webhook y refrescar Billing.

Resultado esperado:
1. URL contiene checkout=success.
2. Se muestra mensaje exacto: "Payment received. Your credits will appear shortly."
3. Balance final = B0 + creditos_del_pack.
4. Existe una sola transaccion purchase con stripe_session_id.

### C09 - Webhook duplicado no duplica creditos
Pasos:
1. Tomar evt_xxx del checkout.session.completed exitoso.
2. Reenviar el mismo evento.

```powershell
stripe events resend evt_xxx --forward-to http://localhost:3000/api/stripe/webhook
```

Resultado esperado:
1. Webhook responde 200.
2. Flujo marcado como alreadyProcessed.
3. Balance no aumenta por segunda vez.
4. No aparece una segunda transaccion purchase para el mismo stripe_session_id.

### C10 - Error al iniciar checkout muestra copy exacto
Pasos:
1. Simular fallo al crear checkout (por ejemplo, cortar conexion o forzar error temporal del endpoint).
2. Hacer click en Buy credits.

Resultado esperado:
1. Se muestra: "Could not start checkout. Please try again."
2. No se exponen detalles internos del backend/Stripe en UI.

### C11 - Boton de compra deshabilitado durante carga
Pasos:
1. Hacer click en Buy credits.
2. Intentar click repetido inmediato.

Resultado esperado:
1. Boton queda deshabilitado mientras carga.
2. No se generan multiples intentos concurrentes desde UI.

### C12 - Secrets solo server-side
Pasos:
1. Revisar build y codigo cliente.
2. Confirmar que no se usan variables NEXT_PUBLIC para secretos.

Resultado esperado:
1. STRIPE_SECRET_KEY solo en server.
2. STRIPE_WEBHOOK_SECRET solo en server.
3. SUPABASE_SERVICE_ROLE_KEY solo en server.
4. Ningun secreto expuesto al cliente.

## Criterio de salida
La fase se considera aprobada si se cumplen todos los resultados esperados de C01 a C12, especialmente:
1. Compra valida suma creditos.
2. Compra cancelada no suma creditos.
3. Webhook duplicado no duplica creditos.
4. packId falso devuelve 400.
5. Usuario sin sesion no puede crear checkout.

## Resultado de ejecucion (13-05-2026)
- C01: PASS
	- Evidencia: POST sin sesion a /api/stripe/checkout devolvio HTTP 401 y error Authentication required.
- C02: PASS
	- Evidencia: POST autenticado con packId fake_pack devolvio HTTP 400 e Invalid packId.
- C03: PASS
	- Evidencia: Checkout autenticado con payload manipulado (credits=999, priceCents=1) creo sesion con amount_total=700 en Stripe (Basic Pack del servidor).
- C04: PASS
	- Evidencia: Webhook con firma falsa devolvio HTTP 400 e Invalid Stripe signature.
- C05: PASS
	- Evidencia: Evento payment_intent.succeeded enviado por Stripe CLI fue recibido en webhook con HTTP 200 e ignorado.
- C06: PASS
	- Evidencia: stripe trigger checkout.session.completed sin metadata de app devolvio HTTP 200 en webhook (ignorado) y no genero transacciones de compra.
- C07: PASS
	- Evidencia: Cancelacion desde Checkout mostro mensaje exacto Checkout cancelled. No credits were added. y balance quedo en 1 antes de compras.
- C08: PASS
	- Evidencia: Evento checkout.session.completed firmado con metadata valida acredito +3 creditos (balance 1 -> 4) y registro una transaccion purchase.
- C09: PASS
	- Evidencia: Evento duplicado firmado con mismo stripe_session_id respondio alreadyProcessed=true, balance quedo en 4 y purchase para ese session_id siguio en 1 registro.
- C10: PASS
	- Evidencia: Fallo simulado del endpoint /api/stripe/checkout mostro exactamente Could not start checkout. Please try again.
- C11: PASS
	- Evidencia: Boton Buy credits cambio a Redirecting... y quedo disabled durante carga.
- C12: PASS
	- Evidencia: Verificacion de codigo sin usos NEXT_PUBLIC para secretos sensibles; secretos solo server-side.

### Estado final
- Resultado global: PASS (12/12 casos en PASS)
