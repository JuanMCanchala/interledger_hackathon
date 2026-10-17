/**
 * Small SVG charts for the shopkeeper's panel: no library and no canvas, so they stay sharp and
 * light on cheap phones and take their colors from the design system (css/miplante.css).
 */

const SVG = "http://www.w3.org/2000/svg";

function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null) node.setAttribute(key, String(value));
  }
  for (const child of children) if (child) node.append(child);
  return node;
}

function title(text) {
  const node = svg("title");
  node.textContent = text;
  return node;
}

/**
 * Vertical bars, one per entry, with an optional dashed goal line. Re-renders only when the data
 * changed, so polling never makes it flicker.
 * @param {HTMLElement} container
 * @param {{ bars: { label: string, value: number, title: string, highlight?: boolean }[],
 *           goal?: number, goalLabel?: string, summary: string }} data
 */
export function barChart(container, { bars, goal, goalLabel, summary }) {
  const signature = JSON.stringify([bars, goal]);
  if (container.dataset.signature === signature) return;
  container.dataset.signature = signature;

  const height = 140;
  const top = 12;
  const slot = 16;
  const width = Math.max(bars.length * slot, slot * 7);
  const max = Math.max(1, goal ?? 0, ...bars.map((bar) => bar.value));
  const y = (value) => top + (height - top) * (1 - value / max);

  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height + 18}`,
    class: "chart",
    role: "img",
    "aria-label": summary,
  });
  chart.append(
    svg("line", { x1: 0, x2: width, y1: height, y2: height, class: "chart-axis" }),
  );
  bars.forEach((bar, index) => {
    const barHeight = Math.max(bar.value > 0 ? 2 : 0, height - y(bar.value));
    chart.append(
      svg(
        "rect",
        {
          x: index * slot + 3,
          y: height - barHeight,
          width: slot - 6,
          height: barHeight,
          rx: 3,
          class: `chart-bar${bar.highlight ? " is-today" : ""}`,
        },
        title(bar.title),
      ),
    );
    // Label the first day, every fifth day and the last one, so the axis stays readable on a phone.
    const day = index + 1;
    if (day === 1 || day % 5 === 0 || index === bars.length - 1) {
      const label = svg("text", {
        x: index * slot + slot / 2,
        y: height + 14,
        class: "chart-label",
        "text-anchor": "middle",
      });
      label.textContent = bar.label;
      chart.append(label);
    }
  });
  if (goal && goal > 0) {
    chart.append(
      svg(
        "line",
        { x1: 0, x2: width, y1: y(goal), y2: y(goal), class: "chart-goal" },
        title(goalLabel || "Meta"),
      ),
    );
  }
  container.replaceChildren(chart);
}

/**
 * A progress ring with the percentage in the middle.
 * @param {HTMLElement} container
 * @param {{ ratio: number, tone?: "brand" | "gold" | "info", label: string }} data
 */
export function ring(container, { ratio, tone = "brand", label }) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  const signature = JSON.stringify([clamped, tone]);
  if (container.dataset.signature === signature) return;
  container.dataset.signature = signature;

  const radius = 42;
  const length = 2 * Math.PI * radius;
  const text = svg("text", {
    x: 50,
    y: 50,
    class: "ring-text",
    "text-anchor": "middle",
    "dominant-baseline": "central",
  });
  text.textContent = `${Math.round(clamped * 100)}%`;
  container.replaceChildren(
    svg(
      "svg",
      { viewBox: "0 0 100 100", class: `ring is-${tone}`, role: "img", "aria-label": label },
      svg("circle", { cx: 50, cy: 50, r: radius, class: "ring-track" }),
      svg("circle", {
        cx: 50,
        cy: 50,
        r: radius,
        class: "ring-fill",
        "stroke-dasharray": `${length * clamped} ${length}`,
        transform: "rotate(-90 50 50)",
      }),
      text,
    ),
  );
}
