# Guía del Equipo: Distribución Oficial de Roles y Wallets (5 Integrantes)

Esta guía contiene las **6 Wallet Addresses oficiales ya creadas por el equipo** en el [Test Wallet de Interledger](https://wallet.interledger-test.dev) para simular todo el ecosistema de **MiPlante** en vivo durante el desarrollo y la demo.

---

## 👥 Wallets Oficiales por Rol (5 Integrantes)

### 🏪 PERSONA 1: El Tendero ("Tienda Billeticos - MiPlante")

Es el corazón de la demo. Cuenta con **2 Wallets en COP**:

1. **Wallet 1 (Caja Principal de la Tienda):**
   * **Payment Pointer (`$`):** `$ilp.interledger-test.dev/tienda-billeticos`
   * **URL (`https://`):** `https://ilp.interledger-test.dev/tienda-billeticos`
   * **Moneda:** `COP`
   * **Para qué sirve:** Aquí entran las ventas de los clientes y desde aquí sale el dinero del `Grant` pre-autorizado cuando hace el *split* automático o cuando vende en efectivo.
2. **Wallet 2 (Bolsillo de Emergencia / Ahorro Intocable):**
   * **Payment Pointer (`$`):** `$ilp.interledger-test.dev/ahorro-billeticos`
   * **URL (`https://`):** `https://ilp.interledger-test.dev/ahorro-billeticos`
   * **Moneda:** `COP`
   * **Para qué sirve:** Recibe automáticamente el **5%** de cada venta que hace la tienda (para que se vea cómo sube su ahorro separado del gasto diario).

* 🔑 **IMPORTANTE (Developer Keys):** En **Settings ➡️ Developer Keys**, el `Key ID` y la `private.key` deben estar generados sobre la wallet que actúa como cliente de la app (`OP_CLIENT_WALLET_ADDRESS=https://ilp.interledger-test.dev/tienda-billeticos`).

---

### 🙋‍♂️ PERSONA 2: El Cliente del Barrio en COP (Pago Local + Efectivo / "Cajero Humano")

Simula al vecino de Medellín que compra todos los días en pesos colombianos o recibe su vuelto digital:

1. **Wallet 1 (Billetera del Cliente COP):**
   * **Payment Pointer (`$`):** `$ilp.interledger-test.dev/cliente-one`
   * **URL (`https://`):** `https://ilp.interledger-test.dev/cliente-one`
   * **Moneda:** `COP`
   * **Para qué sirve:**
     * **Escenario 1:** Paga una compra digital con QR en la tienda en COP.
     * **Escenario 2 (Efectivo / Vuelto Digital):** Entrega un billete físico y recibe su **"vuelto digital"** instantáneo en esta billetera (o cambia saldo digital por efectivo del cajón).

---

### 🌎 PERSONA 3: El Cliente Extranjero / Turista en USD (Punto de "Distintas Divisas")

Simula a un extranjero en Medellín comprando en dólares (`USD`) en la tienda o enviando apoyo desde el exterior:

1. **Wallet 1 (Billetera Internacional USD):**
   * **Payment Pointer (`$`):** `$ilp.interledger-test.dev/extranjero-billeticos`
   * **URL (`https://`):** `https://ilp.interledger-test.dev/extranjero-billeticos`
   * **Moneda:** `USD`
   * **Para qué sirve:** Cuando esta persona paga una venta en COP de la tienda, Open Payments hace una **Cotización (`Quote`)** con conversión automática de `USD` a `COP` y aun así el sistema divide el pago en `COP` hacia el proveedor, el microcrédito y el ahorro. ¡Cumple el criterio de **"Distintas divisas"** del jurado!

---

### 🚚 PERSONA 4: El Proveedor de Insumos ("Distribuidora / Campesino")

Simula al proveedor de mercancía que abastece a la tienda:

1. **Wallet 1 (Billetera del Proveedor):**
   * **Payment Pointer (`$`):** `$ilp.interledger-test.dev/proveedor-billeticos`
   * **URL (`https://`):** `https://ilp.interledger-test.dev/proveedor-billeticos`
   * **Moneda:** `COP`
   * **Para qué sirve:** Recibe automáticamente en tiempo real el porcentaje configurado (ej. **10%**) de cada venta que hace la tienda, abonando a la factura de insumos sin transferencias manuales.

---

### 🛡️ PERSONA 5: El Fondo Microcrédito "Anti-Gota" (Capital de Trabajo)

Simula la cooperativa o fondo comunitario que le prestó el "plante" (capital de trabajo) a tasa justa para erradicar el "gota a gota":

1. **Wallet 1 (Billetera Microcrédito):**
   * **Payment Pointer (`$`):** `$ilp.interledger-test.dev/microcredito`
   * **URL (`https://`):** `https://ilp.interledger-test.dev/microcredito`
   * **Moneda:** `COP`
   * **Para qué sirve:** Con cada venta de la tienda, recibe automáticamente su porcentaje (ej. **10% o 15%**) hasta saldar el crédito. Si la tienda no vende hoy, hoy no se le cobra nada.

---

## 📋 Tabla Resumen Oficial (Copiar y Pegar en Demo / Pruebas)

| Integrante | Rol en la Demo | Moneda | Payment Pointer (`$`) | URL (`https://`) |
| :--- | :--- | :---: | :--- | :--- |
| **Persona 1** | 🏪 Tendero (Caja Principal) | `COP` | `$ilp.interledger-test.dev/tienda-billeticos` | `https://ilp.interledger-test.dev/tienda-billeticos` |
| **Persona 1** | 🐷 Tendero (Ahorro Emergencia) | `COP` | `$ilp.interledger-test.dev/ahorro-billeticos` | `https://ilp.interledger-test.dev/ahorro-billeticos` |
| **Persona 2** | 🙋‍♂️ Cliente Local | `COP` | `$ilp.interledger-test.dev/cliente-one` | `https://ilp.interledger-test.dev/cliente-one` |
| **Persona 3** | 🌎 Cliente Extranjero (Multidivisa) | `USD` | `$ilp.interledger-test.dev/extranjero-billeticos` | `https://ilp.interledger-test.dev/extranjero-billeticos` |
| **Persona 4** | 🚚 Proveedor de Mercancía | `COP` | `$ilp.interledger-test.dev/proveedor-billeticos` | `https://ilp.interledger-test.dev/proveedor-billeticos` |
| **Persona 5** | 🛡️ Fondo Microcrédito Anti-Gota | `COP` | `$ilp.interledger-test.dev/microcredito` | `https://ilp.interledger-test.dev/microcredito` |

---

## ⚡ Comando de Verificación Rápida

Una vez configurado tu archivo `.env` con `OP_KEY_ID` y `private.key`, puedes verificar las 6 wallets del equipo con:

```bash
npm run check:wallet -- '$ilp.interledger-test.dev/tienda-billeticos' '$ilp.interledger-test.dev/ahorro-billeticos' '$ilp.interledger-test.dev/proveedor-billeticos' '$ilp.interledger-test.dev/microcredito' '$ilp.interledger-test.dev/cliente-one' '$ilp.interledger-test.dev/extranjero-billeticos'
```
