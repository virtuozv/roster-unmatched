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
