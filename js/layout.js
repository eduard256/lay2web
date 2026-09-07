/**
 * Layout algorithms: auto layout (masonry grid), alignment, snapping.
 * Pure functions returning update lists for State.updateBlocks.
 */
const Layout = (() => {
  /**
   * Arrange blocks into a column grid. Blocks keep their aspect ratio and are
   * placed in reading order (top-to-bottom, left-to-right) into the shortest column.
   * @returns {Array} updates [{ id, x, y, w, h }]
   */
  function autoLayout(blocks, { canvasW, cols, gap, margin, startY }) {
    if (!blocks.length) return [];
    cols = Math.max(1, Math.min(cols, blocks.length));
    const contentW = canvasW - margin * 2;
    const colW = Math.round((contentW - gap * (cols - 1)) / cols);

    // reading order: by row band (y) first, then x
    const ordered = [...blocks].sort((a, b) => {
      const band = 40;
      const ay = Math.round(a.y / band);
      const by = Math.round(b.y / band);
      return ay !== by ? a.y - b.y : a.x - b.x;
    });

    const heights = new Array(cols).fill(startY);
    return ordered.map((block) => {
      const col = heights.indexOf(Math.min(...heights));
      const ratio = block.w / block.h;
      const w = colW;
      const h = block.type === "image" ? Math.round(w / ratio) : block.h;
      const x = margin + col * (colW + gap);
      const y = heights[col];
      heights[col] += h + gap;
      return { id: block.id, x, y, w, h };
    });
  }

  /** Align a group of blocks relative to their bounding box. */
  function align(blocks, mode) {
    if (blocks.length < 2) return [];
    const box = bounds(blocks);
    return blocks.map((b) => {
      const u = { id: b.id };
      switch (mode) {
        case "left": u.x = box.x; break;
        case "right": u.x = box.x + box.w - b.w; break;
        case "hcenter": u.x = Math.round(box.x + box.w / 2 - b.w / 2); break;
        case "top": u.y = box.y; break;
        case "bottom": u.y = box.y + box.h - b.h; break;
        case "vcenter": u.y = Math.round(box.y + box.h / 2 - b.h / 2); break;
        case "same-width": {
          u.w = blocks[0].w;
          if (b.type === "image" && b.lockRatio) u.h = Math.round((b.h / b.w) * u.w);
          break;
        }
        case "same-height": {
          u.h = blocks[0].h;
          if (b.type === "image" && b.lockRatio) u.w = Math.round((b.w / b.h) * u.h);
          break;
        }
      }
      return u;
    });
  }

  function bounds(blocks) {
    const x1 = Math.min(...blocks.map((b) => b.x));
    const y1 = Math.min(...blocks.map((b) => b.y));
    const x2 = Math.max(...blocks.map((b) => b.x + b.w));
    const y2 = Math.max(...blocks.map((b) => b.y + b.h));
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  /**
   * Snap a moving rect to other blocks' edges/centers and canvas edges/center.
   * @returns {{ dx, dy, guides: [{axis:"v"|"h", pos}] }}
   */
  function snap(rect, others, canvasW, threshold) {
    const vLines = [0, canvasW / 2, canvasW];
    const hLines = [0];
    for (const o of others) {
      vLines.push(o.x, o.x + o.w / 2, o.x + o.w);
      hLines.push(o.y, o.y + o.h / 2, o.y + o.h);
    }

    const rectV = [rect.x, rect.x + rect.w / 2, rect.x + rect.w];
    const rectH = [rect.y, rect.y + rect.h / 2, rect.y + rect.h];

    const bestX = closest(rectV, vLines, threshold);
    const bestY = closest(rectH, hLines, threshold);

    const guides = [];
    if (bestX) guides.push({ axis: "v", pos: bestX.line });
    if (bestY) guides.push({ axis: "h", pos: bestY.line });

    return { dx: bestX ? bestX.delta : 0, dy: bestY ? bestY.delta : 0, guides };
  }

  function closest(edges, lines, threshold) {
    let best = null;
    for (const e of edges) {
      for (const l of lines) {
        const d = l - e;
        if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.delta))) {
          best = { delta: d, line: l };
        }
      }
    }
    return best;
  }

  return { autoLayout, align, bounds, snap };
})();
