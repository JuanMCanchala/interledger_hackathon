import React from "react";

export const metadata = {
  title: "MiPlante · Cada venta se reparte sola (Open Payments)",
  description:
    "Caja inteligente e inclusión financiera para micronegocios en Colombia impulsada por Interledger Open Payments.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <head>
        <link rel="stylesheet" href="/styles.css" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body>{children}</body>
    </html>
  );
}
