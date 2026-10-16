import React from "react";

export default function HomePage() {
  return (
    <div className="container">
      <header className="site-header">
        <a className="brand" href="/">
          MiPlante
        </a>
        <nav className="row">
          <a className="btn btn-ghost" href="/sandbox.html">
            Sandbox Open Payments
          </a>
          <a className="btn btn-primary" href="/onboard.html">
            Registrar mi negocio
          </a>
        </nav>
      </header>

      <main className="stack">
        <section className="hero stack">
          <p className="eyebrow">Open Payments · Interledger Medellín 2026</p>
          <h1>Cada venta se reparte sola.</h1>
          <p className="lead">
            Con <strong>MiPlante</strong>, los micronegocios e independientes en
            Colombia pagan proveedores y microcréditos automáticamente en
            proporción a lo que venden hoy.{" "}
            <strong>Si hoy no vendes, hoy nadie te cobra.</strong>
          </p>
          <div className="row">
            <a className="btn btn-primary btn-lg" href="/onboard.html">
              Registrar mi negocio
            </a>
            <a className="btn btn-secondary btn-lg" href="/sandbox.html">
              Probar flujos Open Payments
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
