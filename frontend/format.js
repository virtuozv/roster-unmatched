export function countWord(count, one, few, many) {
  const tail = Math.abs(count) % 100;
  const last = tail % 10;
  if (tail > 10 && tail < 15) {
    return many;
  }
  if (last === 1) {
    return one;
  }
  if (last > 1 && last < 5) {
    return few;
  }
  return many;
}

export function formatBound(value, fallback) {
  const number = Number(value);
  const shown = Number.isFinite(number) ? number : fallback;
  if (Number.isInteger(shown)) {
    return String(shown);
  }
  return shown.toFixed(1).replace(".", ",");
}

export function formatScore(value) {
  return Number(value).toFixed(1).replace(".", ",");
}

export function formatBandPercent(summary) {
  const below = Number(summary.below) || 0;
  const inside = Number(summary.inside) || 0;
  const above = Number(summary.above) || 0;
  const known = below + inside + above;
  if (known <= 0) {
    return "—";
  }
  return ((100 * inside) / known).toFixed(1).replace(".", ",") + "%";
}
