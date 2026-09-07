/**
 * Canvas rendering and pointer interactions: select, drag, resize, marquee,
 * snapping guides, inline text editing, zoom/pan.
 */
const Canvas = (() => {
  const MIN_SIZE = 10;
  const SNAP_PX = 6; // screen pixels
  const WORLD_PADDING = 40;
  const EXTRA_BOTTOM = 600; // free space below the lowest block

  const viewport = document.getElementById("viewport");
  const world = document.getElementById("world");
  const canvas = document.getElementById("canvas");
  const blocksLayer = document.getElementById("blocks");
  const guidesLayer = document.getElementById("guides");
  const marqueeEl = document.getElementById("marquee");
  const foldLine = document.getElementById("fold");

  const elements = new Map(); // block id -> element
  let spaceHeld = false;
  let editingId = null;
  let interaction = null; // current pointer interaction

  /* ---------- rendering ---------- */

  function render() {
    const { zoom, selection } = State.state;
    const blocks = State.currentBlocks();
    const canvasW = State.canvasWidth();
    // at least one screen (16:9 desktop / 9:16 mobile), then grows with content like a real page
    const screenH = State.screenHeight();
    const canvasH = Math.max(screenH, State.contentBottom() + EXTRA_BOTTOM);
    foldLine.style.top = screenH + "px";
    foldLine.querySelector(".fold__label").textContent = `First screen · ${canvasW} × ${screenH}`;

    canvas.style.width = canvasW + "px";
    canvas.style.height = canvasH + "px";
    canvas.style.transform = `scale(${zoom})`;
    canvas.style.setProperty("--hs", 1 / zoom);
    world.style.width = canvasW * zoom + WORLD_PADDING * 2 + "px";
    world.style.height = canvasH * zoom + WORLD_PADDING * 2 + "px";

    // remove stale elements
    const ids = new Set(blocks.map((b) => b.id));
    for (const [id, el] of elements) {
      if (!ids.has(id)) {
        el.remove();
        elements.delete(id);
      }
    }

    // create / update in z-order
    blocks.forEach((block, index) => {
      let el = elements.get(block.id);
      if (!el) {
        el = createElement(block);
        elements.set(block.id, el);
      }
      updateElement(el, block, selection.has(block.id), selection.size === 1);
      if (blocksLayer.children[index] !== el) blocksLayer.insertBefore(el, blocksLayer.children[index] || null);
    });
  }

  function createElement(block) {
    const el = document.createElement("div");
    el.className = `block block--${block.type}`;
    el.dataset.id = block.id;
    const inner = document.createElement("div");
    inner.className = block.type === "image" ? "block__label" : "block__text";
    el.appendChild(inner);
    return el;
  }

  function updateElement(el, block, selected, single) {
    el.style.left = block.x + "px";
    el.style.top = block.y + "px";
    el.style.width = block.w + "px";
    el.style.height = block.h + "px";
    el.classList.toggle("is-selected", selected);
    el.classList.toggle("is-locked", !!block.locked);

    if (block.type === "image") {
      const label = el.querySelector(".block__label");
      label.textContent = block.label || `${Utils.ratioLabel(block.w, block.h)}\n${block.w} × ${block.h}`;
    } else if (editingId !== block.id) {
      el.querySelector(".block__text").textContent = block.text;
      el.style.fontSize = block.fontSize + "px";
      el.style.textAlign = block.align;
      el.style.fontWeight = block.bold ? 700 : 400;
    }

    const wantHandles = selected && single && !block.locked && editingId !== block.id;
    const hasHandles = !!el.querySelector(".handle");
    if (wantHandles && !hasHandles) addHandles(el);
    if (!wantHandles && hasHandles) el.querySelectorAll(".handle, .block__size-tag").forEach((h) => h.remove());
    if (wantHandles) {
      const tag = el.querySelector(".block__size-tag");
      tag.textContent = `${block.w} × ${block.h}`;
    }
  }

  function addHandles(el) {
    for (const dir of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {
      const h = document.createElement("div");
      h.className = `handle handle--${dir}`;
      h.dataset.dir = dir;
      el.appendChild(h);
    }
    const tag = document.createElement("div");
    tag.className = "block__size-tag";
    el.appendChild(tag);
  }

  function renderGuides(guides) {
    guidesLayer.innerHTML = "";
    for (const g of guides) {
      const line = document.createElement("div");
      line.className = `guide guide--${g.axis}`;
      line.style[g.axis === "v" ? "left" : "top"] = g.pos + "px";
      guidesLayer.appendChild(line);
    }
  }

  /* ---------- coordinates ---------- */

  function toCanvas(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const zoom = State.state.zoom;
    return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom };
  }

  /** Canvas coordinates of the visible viewport center. */
  function visibleCenter() {
    const rect = viewport.getBoundingClientRect();
    return toCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  /* ---------- zoom ---------- */

  function setZoom(zoom, anchorClient) {
    const old = State.state.zoom;
    const next = Utils.clamp(zoom, 0.1, 4);
    if (next === old) return;

    // keep the point under the anchor stationary
    const rect = viewport.getBoundingClientRect();
    const ax = anchorClient ? anchorClient.x - rect.left : rect.width / 2;
    const ay = anchorClient ? anchorClient.y - rect.top : rect.height / 2;
    const canvasX = (viewport.scrollLeft + ax - WORLD_PADDING) / old;
    const canvasY = (viewport.scrollTop + ay - WORLD_PADDING) / old;

    State.setZoom(next);
    viewport.scrollLeft = canvasX * next + WORLD_PADDING - ax;
    viewport.scrollTop = canvasY * next + WORLD_PADDING - ay;
  }

  function zoomToFit() {
    // fit the whole first screen (width and height) into the viewport
    const availW = viewport.clientWidth - WORLD_PADDING * 2 - 40;
    const availH = viewport.clientHeight - WORLD_PADDING * 2 - 40;
    setZoom(Math.min(availW / State.canvasWidth(), availH / State.screenHeight()));
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
  }

  /* ---------- pointer interactions ---------- */

  function onPointerDown(e) {
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      startPan(e);
      return;
    }
    if (e.button !== 0) return;

    const handle = e.target.closest(".handle");
    const blockEl = e.target.closest(".block");

    if (blockEl && editingId === blockEl.dataset.id) return; // typing in text block

    if (handle && blockEl) {
      startResize(e, blockEl.dataset.id, handle.dataset.dir);
      return;
    }

    if (blockEl) {
      const id = blockEl.dataset.id;
      if (e.shiftKey) {
        State.toggleSelect(id);
      } else if (!State.state.selection.has(id)) {
        State.select([id]);
      }
      if (State.state.selection.has(id)) startDrag(e);
      return;
    }

    if (e.target === canvas || e.target === blocksLayer) {
      startMarquee(e);
    }
  }

  function startPan(e) {
    e.preventDefault();
    interaction = {
      type: "pan",
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    viewport.classList.add("is-panning");
    viewport.setPointerCapture(e.pointerId);
  }

  function startDrag(e) {
    const moving = State.selectedBlocks().filter((b) => !b.locked);
    if (!moving.length) return;
    const start = toCanvas(e.clientX, e.clientY);
    interaction = {
      type: "drag",
      start,
      originals: moving.map((b) => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h })),
      others: State.currentBlocks().filter((b) => !State.state.selection.has(b.id)),
      committed: false,
    };
    viewport.setPointerCapture(e.pointerId);
  }

  function startResize(e, id, dir) {
    const block = State.getBlock(id);
    if (!block || block.locked) return;
    e.stopPropagation();
    interaction = {
      type: "resize",
      id,
      dir,
      start: toCanvas(e.clientX, e.clientY),
      original: { x: block.x, y: block.y, w: block.w, h: block.h },
      committed: false,
    };
    viewport.setPointerCapture(e.pointerId);
  }

  function startMarquee(e) {
    if (!e.shiftKey) State.clearSelection();
    const start = toCanvas(e.clientX, e.clientY);
    interaction = { type: "marquee", start, additive: e.shiftKey, base: new Set(State.state.selection) };
    viewport.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    const pos = toCanvas(e.clientX, e.clientY);
    App.setCursorStatus(pos);
    if (!interaction) return;

    switch (interaction.type) {
      case "pan":
        viewport.scrollLeft = interaction.scrollLeft - (e.clientX - interaction.startX);
        viewport.scrollTop = interaction.scrollTop - (e.clientY - interaction.startY);
        break;
      case "drag":
        moveDrag(pos, e);
        break;
      case "resize":
        moveResize(pos, e);
        break;
      case "marquee":
        moveMarquee(pos);
        break;
    }
  }

  function ensureCommitted() {
    if (!interaction.committed) {
      State.commit();
      interaction.committed = true;
    }
  }

  function moveDrag(pos, e) {
    ensureCommitted();
    let dx = Math.round(pos.x - interaction.start.x);
    let dy = Math.round(pos.y - interaction.start.y);

    // snap the group's bounding box unless Alt is held
    let guides = [];
    if (!e.altKey) {
      const box = Layout.bounds(interaction.originals);
      const moved = { x: box.x + dx, y: box.y + dy, w: box.w, h: box.h };
      const snapped = Layout.snap(moved, interaction.others, State.canvasWidth(), SNAP_PX / State.state.zoom);
      dx += snapped.dx;
      dy += snapped.dy;
      guides = snapped.guides;
    }
    if (e.shiftKey) {
      // constrain to axis
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }

    renderGuides(guides);
    State.updateBlocks(
      interaction.originals.map((o) => ({ id: o.id, x: o.x + dx, y: o.y + dy })),
      { record: false }
    );
  }

  function moveResize(pos, e) {
    ensureCommitted();
    const { dir, original: o, id } = interaction;
    const block = State.getBlock(id);
    const dx = pos.x - interaction.start.x;
    const dy = pos.y - interaction.start.y;

    let { x, y, w, h } = o;
    if (dir.includes("e")) w = o.w + dx;
    if (dir.includes("s")) h = o.h + dy;
    if (dir.includes("w")) { w = o.w - dx; x = o.x + dx; }
    if (dir.includes("n")) { h = o.h - dy; y = o.y + dy; }

    const keepRatio = e.shiftKey || (block.type === "image" && block.lockRatio);
    if (keepRatio) {
      const ratio = o.w / o.h;
      const horizontalOnly = dir === "e" || dir === "w";
      const verticalOnly = dir === "n" || dir === "s";
      if (verticalOnly) w = h * ratio;
      else if (horizontalOnly) h = w / ratio;
      else if (Math.abs(dx) > Math.abs(dy)) h = w / ratio;
      else w = h * ratio;
      // re-anchor the opposite edge
      if (dir.includes("w")) x = o.x + o.w - w;
      if (dir.includes("n")) y = o.y + o.h - h;
    }

    w = Math.max(MIN_SIZE, Math.round(w));
    h = Math.max(MIN_SIZE, Math.round(h));
    State.updateBlocks([{ id, x: Math.round(x), y: Math.round(y), w, h }], { record: false });
  }

  function moveMarquee(pos) {
    const { start } = interaction;
    const rect = {
      x: Math.min(start.x, pos.x),
      y: Math.min(start.y, pos.y),
      w: Math.abs(pos.x - start.x),
      h: Math.abs(pos.y - start.y),
    };
    marqueeEl.hidden = false;
    marqueeEl.style.left = rect.x + "px";
    marqueeEl.style.top = rect.y + "px";
    marqueeEl.style.width = rect.w + "px";
    marqueeEl.style.height = rect.h + "px";

    const hit = State.currentBlocks()
      .filter((b) => b.x < rect.x + rect.w && b.x + b.w > rect.x && b.y < rect.y + rect.h && b.y + b.h > rect.y)
      .map((b) => b.id);
    const ids = interaction.additive ? [...interaction.base, ...hit] : hit;
    State.select(ids);
  }

  function onPointerUp(e) {
    if (!interaction) return;
    if (interaction.type === "marquee") marqueeEl.hidden = true;
    if (interaction.type === "pan") viewport.classList.remove("is-panning");
    renderGuides([]);
    interaction = null;
    try { viewport.releasePointerCapture(e.pointerId); } catch (_) { /* already released */ }
    State.emit();
  }

  /* ---------- inline text editing ---------- */

  function onDoubleClick(e) {
    const blockEl = e.target.closest(".block--text");
    if (!blockEl) return;
    const block = State.getBlock(blockEl.dataset.id);
    if (!block || block.locked) return;
    startEditing(blockEl, block);
  }

  function startEditing(el, block) {
    const textEl = el.querySelector(".block__text");
    editingId = block.id;
    el.querySelectorAll(".handle, .block__size-tag").forEach((h) => h.remove());
    textEl.contentEditable = "true";
    el.classList.add("is-editing");
    textEl.focus();
    document.getSelection().selectAllChildren(textEl);

    const onKey = (ev) => {
      if (ev.key === "Escape") { ev.preventDefault(); textEl.blur(); }
      ev.stopPropagation(); // keep global shortcuts away while typing
    };
    const finish = () => {
      textEl.removeEventListener("blur", finish);
      textEl.removeEventListener("keydown", onKey);
      textEl.contentEditable = "false";
      el.classList.remove("is-editing");
      const text = textEl.innerText.replace(/\n$/, "");
      editingId = null;
      if (text !== block.text) State.updateBlocks([{ id: block.id, text }]);
      else State.emit();
    };
    textEl.addEventListener("blur", finish);
    textEl.addEventListener("keydown", onKey);
  }

  function isEditing() {
    return editingId !== null;
  }

  /* ---------- wheel zoom ---------- */

  function onWheel(e) {
    if (!e.ctrlKey && !e.metaKey) return; // plain wheel = native scroll
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.01);
    setZoom(State.state.zoom * factor, { x: e.clientX, y: e.clientY });
  }

  /* ---------- init ---------- */

  function init() {
    viewport.addEventListener("pointerdown", onPointerDown);
    viewport.addEventListener("pointermove", onPointerMove);
    viewport.addEventListener("pointerup", onPointerUp);
    viewport.addEventListener("pointercancel", onPointerUp);
    viewport.addEventListener("dblclick", onDoubleClick);
    viewport.addEventListener("wheel", onWheel, { passive: false });
    viewport.addEventListener("contextmenu", (e) => e.preventDefault());

    window.addEventListener("keydown", (e) => {
      if (e.code === "Space" && !isEditing() && !App.isTypingInField()) {
        spaceHeld = true;
        viewport.classList.add("is-panning");
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") {
        spaceHeld = false;
        if (!interaction) viewport.classList.remove("is-panning");
      }
    });
    window.addEventListener("resize", render);

    State.subscribe(render);
    render();
  }

  return { init, render, setZoom, zoomToFit, visibleCenter, isEditing, viewport };
})();
