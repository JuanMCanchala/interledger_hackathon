import React from "react";

const STEPS = [
  {
    title: "Autorizas una sola vez",
    text: "Desde tu billetera apruebas un límite diario. Nunca se descuenta más de eso y lo puedes cancelar cuando quieras.",
  },
  {
    title: "Tus clientes pagan con QR",
    text: "Escanean el código, aprueban el pago en su billetera y la plata llega a la tuya.",
  },
  {
    title: "Cada venta se reparte sola",
    text: "Una parte paga tu crédito o tu proveedor, otra va a tu ahorro y el resto es tuyo.",
  },
];

export default function HomePage() {
  return (
    <div className="container">
      <header className="site-header">
        <a className="brand" href="/">
          MiPlante
        </a>
        <a className="btn btn-ghost" href="/merchant.html">
          Abrir mi caja
        </a>
      </header>

      <main className="stack">
        <section className="hero stack">
          <p className="eyebrow">Para tenderos, barberos y vendedores</p>
          <h1>Si hoy no vende, hoy no le cobran.</h1>
          <p className="lead">
            Con <strong>MiPlante</strong> cada venta se reparte sola: una
            pequeña parte paga tus deudas y tu ahorro, y la mayor parte es para
            ti. Sin cuotas fijas los días malos.
          </p>
          <div className="row">
            <a className="btn btn-primary btn-lg" href="/onboard.html">
              Registrar mi negocio
            </a>
            <a className="btn btn-secondary btn-lg" href="/merchant.html">
              Abrir mi caja
            </a>
          </div>
        </section>

        <section className="stack" aria-label="Cómo funciona">
          {STEPS.map((step, index) => (
            <article className="card stack-sm" key={step.title}>
              <h2>
                {index + 1}. {step.title}
              </h2>
              <p className="muted">{step.text}</p>
            </article>
          ))}
        </section>
      </main>

      <footer className="site-footer">
        <span>Pagos con Open Payments sobre la red Interledger.</span>
        <a href="/sandbox.html">Sandbox para desarrolladores</a>
      </footer>
    </div>
  );
}
