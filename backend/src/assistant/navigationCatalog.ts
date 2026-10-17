/** The real destinations of the till, described by what the shopkeeper can see and do. */
export const SECTION_IDS = ["inicio", "vender", "efectivo", "metas", "repartos", "ajustes", "avisos"] as const;

export type Section = (typeof SECTION_IDS)[number];

export const NAVIGATION_CATALOG: Readonly<
  Record<Section, { purpose: string; content: string; capabilities: string }>
> = {
  inicio: {
    purpose: "Entender cómo va el negocio hoy y durante el mes.",
    content: "Indicadores del negocio, gráficos de ventas y ganancias, distribución del dinero y últimas ventas.",
    capabilities: "Consultar el desempeño del negocio y revisar sus ventas recientes.",
  },
  vender: {
    purpose: "Cobrar a un cliente y registrar una venta.",
    content: "Formulario de venta y código QR de cobro.",
    capabilities: "Generar cobros QR y registrar ventas.",
  },
  efectivo: {
    purpose: "Gestionar el efectivo cuyos repartos todavía deben llegar a la billetera.",
    content: "Monto pendiente de consignar, consignaciones e historial de efectivo.",
    capabilities: "Revisar el efectivo pendiente y registrar consignaciones.",
  },
  metas: {
    purpose: "Planear y seguir objetivos de ventas y ahorro.",
    content: "Objetivos, progreso y proyecciones de ventas y ahorro.",
    capabilities: "Consultar el avance hacia las metas y sus proyecciones.",
  },
  repartos: {
    purpose: "Organizar cómo se distribuye cada venta.",
    content: "Reglas de reparto, bolsillos y pagos enviados.",
    capabilities: "Revisar y gestionar reglas y bolsillos, y consultar los pagos enviados.",
  },
  ajustes: {
    purpose: "Configurar la tienda y su acceso.",
    content: "Datos de la tienda, billetera, autorizaciones, voz y sesión.",
    capabilities: "Modificar la configuración, gestionar autorizaciones y preferencias de voz, y cerrar sesión.",
  },
  avisos: {
    purpose: "Atender lo que necesita revisión en la tienda.",
    content: "Notificaciones y pagos que requieren atención.",
    capabilities: "Revisar avisos y resolver pagos pendientes de atención.",
  },
};
