# Prompt 10 — Estados del reparto en pantalla y tokens inactivos

**Fecha:** 17 de octubre de 2026
**Herramienta:** Claude Code (Claude Opus 5.5)

## Contexto y objetivo

Tras un pago, la caja mostraba los envíos a cada billetera en "enviando…" aunque el dinero ya se había repartido.

## Prompt de ingeniería (versión refinada)

> 1. Diagnostica antes de corregir: compara el estado real de cada cobro del reparto en la base de datos con lo que muestra la caja, y revisa los logs del backend.
> 2. Corrige la causa de la pantalla desactualizada en la caja y en el checkout del cliente.
> 3. Corrige cualquier otro fallo que aparezca en los logs y verifícalo contra la red real.

## Resultado

- **Pantalla:** en la base, todos los cobros estaban `completed`. La caja y el checkout dejaban de consultar en cuanto el reparto terminaba, mientras cada cobro seguía en camino. Ahora una venta solo se considera terminada cuando ningún cobro del reparto está en proceso.
- **Tokens:** los logs mostraban `403 Inactive Token` al leer las incoming payments de las ventas en espera, y el código solo pedía un permiso nuevo ante un 401. Ahora los permisos no interactivos se renuevan una vez ante 401 o 403. Se probó con un script contra la red de prueba y, tras el reinicio, el backend no volvió a registrar el error.
- **Hallazgo:** una venta de prueba tenía un pago parcial real (5.000 COP recibidos), que la caja ya muestra con el aviso de lo que falta.
