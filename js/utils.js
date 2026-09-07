/**
 * Small shared helpers.
 */
const Utils = (() => {
  const COMMON_RATIOS = [
    [1, 1], [4, 3], [3, 2], [16, 9], [21, 9], [4, 5], [3, 4], [2, 3], [9, 16], [3, 1], [2, 1], [1, 2], [5, 4],
  ];

  /** "16:9" if close to a common ratio, otherwise "1.37:1". */
  function ratioLabel(w, h) {
    if (!w || !h) return "";
    const r = w / h;
    for (const [a, b] of COMMON_RATIOS) {
      if (Math.abs(r - a / b) < 0.015) return `${a}:${b}`;
    }
    return `${r.toFixed(2)}:1`;
  }

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  return { COMMON_RATIOS, ratioLabel, clamp, debounce };
})();
