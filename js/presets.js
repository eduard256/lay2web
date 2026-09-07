/**
 * Preset layouts. Each preset is a list of rows; each row is a list of items.
 * Item: { w: fraction of content width (0..1), ratio: width/height for images,
 *         type: "image" | "text", h: fixed height for text, text, fontSize, bold }
 * Rows are stacked vertically; items in a row are laid out left to right.
 * A "masonry" preset uses columns instead of rows.
 */
const Presets = (() => {
  const MARGIN = 80; // side margin on desktop
  const MARGIN_MOBILE = 16;
  const GAP = 24;
  const GAP_MOBILE = 12;

  const img = (w, ratio) => ({ type: "image", w, ratio });
  const txt = (w, h, text, extra = {}) => ({ type: "text", w, h, text, ...extra });

  const HEADING = "Section heading goes here";
  const PARAGRAPH =
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";

  const list = [
    {
      name: "Hero 16:9",
      desc: "Full-width hero image",
      rows: [[img(1, 16 / 9)]],
    },
    {
      name: "Wide banner + heading",
      desc: "21:9 banner with title and paragraph",
      rows: [
        [img(1, 21 / 9)],
        [txt(1, 48, HEADING, { fontSize: 36, bold: true })],
        [txt(0.66, 72, PARAGRAPH)],
      ],
    },
    {
      name: "Two squares",
      desc: "Two 1:1 images side by side",
      rows: [[img(0.5, 1), img(0.5, 1)]],
    },
    {
      name: "Three portraits",
      desc: "Three 4:5 images",
      rows: [[img(1 / 3, 4 / 5), img(1 / 3, 4 / 5), img(1 / 3, 4 / 5)]],
    },
    {
      name: "Four squares",
      desc: "Row of four 1:1 thumbnails",
      rows: [[img(0.25, 1), img(0.25, 1), img(0.25, 1), img(0.25, 1)]],
    },
    {
      name: "Wide + tall",
      desc: "2/3 landscape 16:9 next to 1/3 portrait",
      rows: [[img(2 / 3, 16 / 9), img(1 / 3, 4 / 5)]],
    },
    {
      name: "Tall + wide",
      desc: "1/3 portrait next to 2/3 landscape",
      rows: [[img(1 / 3, 4 / 5), img(2 / 3, 16 / 9)]],
    },
    {
      name: "Masonry 3 columns",
      desc: "Mixed ratios packed into columns",
      masonry: {
        cols: 3,
        items: [img(1, 4 / 5), img(1, 1), img(1, 3 / 2), img(1, 1), img(1, 4 / 5), img(1, 16 / 9), img(1, 3 / 2)],
      },
    },
    {
      name: "Gallery 3×2",
      desc: "Six 4:3 images in a grid",
      rows: [
        [img(1 / 3, 4 / 3), img(1 / 3, 4 / 3), img(1 / 3, 4 / 3)],
        [img(1 / 3, 4 / 3), img(1 / 3, 4 / 3), img(1 / 3, 4 / 3)],
      ],
    },
    {
      name: "Image + text",
      desc: "Image left, heading and paragraph right",
      rows: [[img(0.5, 4 / 3), { type: "textStack", w: 0.5 }]],
    },
    {
      name: "Text + image",
      desc: "Heading and paragraph left, image right",
      rows: [[{ type: "textStack", w: 0.5 }, img(0.5, 4 / 3)]],
    },
    {
      name: "Big + two stacked",
      desc: "Large 1:1 with two 2:1 images stacked",
      rows: [[img(0.5, 1), { type: "stack", w: 0.5, items: [img(1, 2), img(1, 2)] }]],
    },
    {
      name: "Stories 9:16",
      desc: "Four vertical 9:16 images",
      rows: [[img(0.25, 9 / 16), img(0.25, 9 / 16), img(0.25, 9 / 16), img(0.25, 9 / 16)]],
    },
    {
      name: "Three cards",
      desc: "4:3 image with title and text under each",
      rows: [
        [img(1 / 3, 4 / 3), img(1 / 3, 4 / 3), img(1 / 3, 4 / 3)],
        [
          txt(1 / 3, 28, "Card title", { fontSize: 20, bold: true }),
          txt(1 / 3, 28, "Card title", { fontSize: 20, bold: true }),
          txt(1 / 3, 28, "Card title", { fontSize: 20, bold: true }),
        ],
        [txt(1 / 3, 60, PARAGRAPH, { fontSize: 14 }), txt(1 / 3, 60, PARAGRAPH, { fontSize: 14 }), txt(1 / 3, 60, PARAGRAPH, { fontSize: 14 })],
      ],
    },
    {
      name: "Banner + thumbnails",
      desc: "3:1 banner with four 1:1 thumbnails",
      rows: [[img(1, 3)], [img(0.25, 1), img(0.25, 1), img(0.25, 1), img(0.25, 1)]],
    },
  ];

  /**
   * Convert a preset into absolute blocks.
   * @param preset  preset definition
   * @param canvasW canvas width in px
   * @param startY  top offset for the first row
   * @param isMobile use tighter margins; rows with 3+ items are wrapped into 2 columns
   */
  function build(preset, canvasW, startY, isMobile) {
    const margin = isMobile ? MARGIN_MOBILE : MARGIN;
    const gap = isMobile ? GAP_MOBILE : GAP;
    const contentW = canvasW - margin * 2;
    const blocks = [];

    if (preset.masonry) {
      buildMasonry(preset.masonry, blocks, margin, startY, contentW, gap, isMobile);
      return blocks;
    }

    let y = startY;
    for (const row of preset.rows) {
      const items = isMobile ? adaptRowForMobile(row) : [row];
      for (const subRow of items) {
        y = placeRow(subRow, blocks, margin, y, contentW, gap) + gap;
      }
    }
    return blocks;
  }

  /** On mobile: rows of 3+ items become rows of 2; rows of 2 stack vertically. */
  function adaptRowForMobile(row) {
    if (row.length >= 3) {
      const out = [];
      for (let i = 0; i < row.length; i += 2) {
        out.push(row.slice(i, i + 2).map((it) => ({ ...it, w: 0.5 })));
      }
      return out;
    }
    if (row.length === 2) return row.map((it) => [{ ...it, w: 1 }]);
    return [row];
  }

  /** Lay one row out; returns the bottom edge of the row. */
  function placeRow(row, blocks, left, top, contentW, gap) {
    const totalGap = gap * (row.length - 1);
    const availW = contentW - totalGap;
    const sumFrac = row.reduce((s, it) => s + it.w, 0);
    let x = left;
    let bottom = top;

    for (const item of row) {
      const w = Math.round((availW * item.w) / sumFrac);
      const h = placeItem(item, blocks, x, top, w, gap);
      bottom = Math.max(bottom, top + h);
      x += w + gap;
    }
    return bottom;
  }

  /** Place a single item (image, text, text stack, or vertical stack). Returns its height. */
  function placeItem(item, blocks, x, y, w, gap) {
    if (item.type === "image") {
      const h = Math.round(w / item.ratio);
      blocks.push(State.createImageBlock({ x, y, w, h }));
      return h;
    }
    if (item.type === "text") {
      blocks.push(
        State.createTextBlock({
          x, y, w, h: item.h,
          text: item.text,
          fontSize: item.fontSize || 18,
          bold: !!item.bold,
        })
      );
      return item.h;
    }
    if (item.type === "textStack") {
      const heading = State.createTextBlock({ x, y, w, h: 44, text: HEADING, fontSize: 32, bold: true });
      const para = State.createTextBlock({ x, y: y + 44 + 16, w, h: 96, text: PARAGRAPH, fontSize: 16 });
      blocks.push(heading, para);
      return 44 + 16 + 96;
    }
    if (item.type === "stack") {
      let cy = y;
      for (const sub of item.items) {
        cy += placeItem(sub, blocks, x, cy, w, gap) + gap;
      }
      return cy - gap - y;
    }
    return 0;
  }

  function buildMasonry(def, blocks, left, top, contentW, gap, isMobile) {
    const cols = isMobile ? 2 : def.cols;
    const colW = Math.round((contentW - gap * (cols - 1)) / cols);
    const heights = new Array(cols).fill(top);

    for (const item of def.items) {
      const col = heights.indexOf(Math.min(...heights));
      const x = left + col * (colW + gap);
      const h = placeItem(item, blocks, x, heights[col], colW, gap);
      heights[col] += h + gap;
    }
  }

  return { list, build, MARGIN, MARGIN_MOBILE, GAP, GAP_MOBILE };
})();
