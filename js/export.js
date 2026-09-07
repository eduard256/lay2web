/**
 * Export helpers: JSON download, static HTML/CSS, PNG.
 */
const Exporter = (() => {
  function download(filename, content, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function ratioLabel(w, h) {
    return Utils.ratioLabel(w, h);
  }

  /** Static HTML with absolutely positioned placeholders — a starting point for real markup. */
  function toHtml(blocks, canvasW, deviceLabel) {
    const height = Math.max(400, blocks.reduce((m, b) => Math.max(m, b.y + b.h), 0) + 80);
    const items = blocks
      .map((b) => {
        const pos = `left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;`;
        if (b.type === "image") {
          const label = b.label || `${ratioLabel(b.w, b.h)} · ${b.w}×${b.h}`;
          return `    <div class="img" style="${pos}" data-ratio="${ratioLabel(b.w, b.h)}"><span>${escapeHtml(label)}</span></div>`;
        }
        const style = `${pos}font-size:${b.fontSize}px;text-align:${b.align};font-weight:${b.bold ? 700 : 400};`;
        return `    <p class="txt" style="${style}">${escapeHtml(b.text)}</p>`;
      })
      .join("\n");

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Layout export — ${deviceLabel}</title>
<style>
  body { margin: 0; background: #e5e5e5; font-family: Inter, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }
  .page { position: relative; width: ${canvasW}px; height: ${height}px; margin: 0 auto; background: #fff; }
  .img { position: absolute; background: #1a1a1a; color: #9a9a9a; display: flex; align-items: center; justify-content: center; font-size: 12px; }
  .txt { position: absolute; margin: 0; line-height: 1.3; color: #111; white-space: pre-wrap; overflow: hidden; }
</style>
</head>
<body>
  <div class="page">
${items}
  </div>
</body>
</html>
`;
  }

  /** Render blocks to a PNG blob via <canvas>. */
  function toPng(blocks, canvasW) {
    const height = Math.max(400, blocks.reduce((m, b) => Math.max(m, b.y + b.h), 0) + 80);
    const scale = 2;
    const c = document.createElement("canvas");
    c.width = canvasW * scale;
    c.height = height * scale;
    const ctx = c.getContext("2d");
    ctx.scale(scale, scale);

    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvasW, height);

    for (const b of blocks) {
      if (b.type === "image") {
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.strokeStyle = "#3a3a3a";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + b.w, b.y + b.h);
        ctx.moveTo(b.x + b.w, b.y); ctx.lineTo(b.x, b.y + b.h);
        ctx.stroke();
        ctx.fillStyle = "#9a9a9a";
        ctx.font = "12px Inter, Helvetica, Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const label = b.label || `${ratioLabel(b.w, b.h)} · ${b.w}×${b.h}`;
        ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2);
      } else {
        drawText(ctx, b);
      }
    }

    return new Promise((resolve) => c.toBlob(resolve, "image/png"));
  }

  function drawText(ctx, b) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(b.x, b.y, b.w, b.h);
    ctx.clip();
    ctx.fillStyle = "#111";
    ctx.font = `${b.bold ? "700" : "400"} ${b.fontSize}px Inter, Helvetica, Arial, sans-serif`;
    ctx.textBaseline = "top";
    ctx.textAlign = b.align === "center" ? "center" : b.align === "right" ? "right" : "left";
    const lineH = b.fontSize * 1.3;
    const x = b.align === "center" ? b.x + b.w / 2 : b.align === "right" ? b.x + b.w : b.x;
    let y = b.y;

    for (const paragraph of String(b.text).split("\n")) {
      const words = paragraph.split(" ");
      let line = "";
      for (const word of words) {
        const test = line ? line + " " + word : word;
        if (ctx.measureText(test).width > b.w && line) {
          ctx.fillText(line, x, y);
          y += lineH;
          line = word;
        } else {
          line = test;
        }
      }
      ctx.fillText(line, x, y);
      y += lineH;
    }
    ctx.restore();
  }

  return { download, toHtml, toPng };
})();
