/**
 * App wiring: toolbar, properties panel, presets panel, keyboard shortcuts,
 * clipboard, persistence and export.
 */
const App = (() => {
  const $ = (id) => document.getElementById(id);

  const RATIOS = [
    ["1:1", 1], ["4:3", 4 / 3], ["3:2", 3 / 2], ["16:9", 16 / 9],
    ["21:9", 21 / 9], ["4:5", 4 / 5], ["3:4", 3 / 4], ["2:3", 2 / 3],
    ["9:16", 9 / 16], ["3:1", 3], ["2:1", 2], ["1:2", 0.5],
  ];

  let clipboard = [];

  /* ---------- helpers ---------- */

  function isTypingInField() {
    const el = document.activeElement;
    return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
  }

  function setCursorStatus(pos) {
    $("status-cursor").textContent = `${Math.round(pos.x)}, ${Math.round(pos.y)}`;
  }

  function isMobile() {
    return State.state.device === "mobile";
  }

  function margin() {
    return isMobile() ? Presets.MARGIN_MOBILE : Presets.MARGIN;
  }

  /* ---------- adding blocks ---------- */

  function defaultSize(type) {
    const canvasW = State.canvasWidth();
    if (type === "image") {
      const w = Math.min(400, canvasW - margin() * 2);
      return { w, h: Math.round(w * 0.75) };
    }
    return { w: Math.min(400, canvasW - margin() * 2), h: 60 };
  }

  function placeAtCenter(type) {
    const size = defaultSize(type);
    const center = Canvas.visibleCenter();
    const x = Utils.clamp(Math.round(center.x - size.w / 2), 0, State.canvasWidth() - size.w);
    const y = Math.max(0, Math.round(center.y - size.h / 2));
    const block = type === "image" ? State.createImageBlock({ x, y, ...size }) : State.createTextBlock({ x, y, ...size });
    State.addBlocks([block]);
  }

  function appendPreset(preset) {
    const bottom = State.contentBottom();
    const startY = bottom === 0 ? margin() : bottom + Presets.GAP * 2;
    const blocks = Presets.build(preset, State.canvasWidth(), startY, isMobile());
    State.addBlocks(blocks);
    scrollToY(startY);
  }

  function scrollToY(y) {
    const vp = Canvas.viewport;
    vp.scrollTo({ top: y * State.state.zoom, behavior: "smooth" });
  }

  /* ---------- auto layout ---------- */

  function runAutoLayout() {
    const selected = State.selectedBlocks();
    const targets = selected.length ? selected : State.currentBlocks();
    const movable = targets.filter((b) => !b.locked);
    if (!movable.length) return;

    const cols = Utils.clamp(parseInt($("auto-cols").value, 10) || 1, 1, 12);
    const gap = Utils.clamp(parseInt($("auto-gap").value, 10) || 0, 0, 200);
    const startY = Math.min(...movable.map((b) => b.y));

    const updates = Layout.autoLayout(movable, {
      canvasW: State.canvasWidth(),
      cols,
      gap,
      margin: margin(),
      startY,
    });
    State.updateBlocks(updates);
    State.select(movable.map((b) => b.id));
  }

  /* ---------- selection commands ---------- */

  function selectedIds() {
    return [...State.state.selection];
  }

  function deleteSelection() {
    State.removeBlocks(selectedIds().filter((id) => !State.getBlock(id).locked));
  }

  function duplicateSelection() {
    State.duplicateBlocks(selectedIds());
  }

  function copySelection() {
    clipboard = State.selectedBlocks().map((b) => ({ ...b }));
  }

  function paste() {
    if (!clipboard.length) return;
    const copies = clipboard.map((b) => ({ ...b, id: undefined, x: b.x + 24, y: b.y + 24, locked: false }));
    const blocks = copies.map((b) =>
      b.type === "image" ? State.createImageBlock(stripId(b)) : State.createTextBlock(stripId(b))
    );
    State.addBlocks(blocks);
    clipboard = blocks.map((b) => ({ ...b }));
  }

  function stripId(b) {
    const { id, ...rest } = b;
    return rest;
  }

  function nudge(dx, dy) {
    const updates = State.selectedBlocks()
      .filter((b) => !b.locked)
      .map((b) => ({ id: b.id, x: b.x + dx, y: b.y + dy }));
    if (updates.length) State.updateBlocks(updates);
  }

  function toggleLock() {
    const blocks = State.selectedBlocks();
    if (!blocks.length) return;
    const lock = !blocks.every((b) => b.locked);
    State.updateBlocks(blocks.map((b) => ({ id: b.id, locked: lock })));
  }

  /* ---------- properties panel ---------- */

  function renderProps() {
    const blocks = State.selectedBlocks();
    const empty = $("props-empty");
    const props = $("props");

    $("status-selection").textContent = `${blocks.length} selected`;
    $("status-canvas").textContent = `${State.DEVICES[State.state.device].label} · ${State.canvasWidth()}px`;
    $("zoom-label").textContent = Math.round(State.state.zoom * 100) + "%";

    if (!blocks.length) {
      empty.hidden = false;
      props.hidden = true;
      return;
    }
    empty.hidden = true;
    props.hidden = false;

    const single = blocks.length === 1 ? blocks[0] : null;
    const box = Layout.bounds(blocks);

    $("props-title").textContent = single
      ? single.type === "image" ? "Image block" : "Text block"
      : `${blocks.length} blocks`;

    setValue("prop-x", box.x);
    setValue("prop-y", box.y);
    setValue("prop-w", single ? single.w : box.w);
    setValue("prop-h", single ? single.h : box.h);
    $("prop-w").disabled = !single;
    $("prop-h").disabled = !single;

    $("props-image").hidden = !(single && single.type === "image");
    $("props-text").hidden = !(single && single.type === "text");
    $("props-align").hidden = blocks.length < 2;

    if (single && single.type === "image") {
      $("prop-lock-ratio").checked = !!single.lockRatio;
      $("prop-label").value = single.label || "";
      const current = single.w / single.h;
      document.querySelectorAll(".ratio-btn").forEach((btn) => {
        btn.classList.toggle("is-active", Math.abs(parseFloat(btn.dataset.ratio) - current) < 0.015);
      });
    }
    if (single && single.type === "text") {
      if (document.activeElement !== $("prop-text")) $("prop-text").value = single.text;
      setValue("prop-font-size", single.fontSize);
      $("prop-align").value = single.align;
      $("prop-bold").checked = !!single.bold;
    }
    $("prop-locked").checked = blocks.every((b) => b.locked);
  }

  function setValue(id, value) {
    const el = $(id);
    if (document.activeElement !== el) el.value = value;
  }

  function bindProps() {
    // position: move the whole selection by delta from its bounding box
    $("prop-x").addEventListener("change", () => {
      const blocks = State.selectedBlocks();
      const dx = num("prop-x") - Layout.bounds(blocks).x;
      State.updateBlocks(blocks.map((b) => ({ id: b.id, x: b.x + dx })));
    });
    $("prop-y").addEventListener("change", () => {
      const blocks = State.selectedBlocks();
      const dy = num("prop-y") - Layout.bounds(blocks).y;
      State.updateBlocks(blocks.map((b) => ({ id: b.id, y: b.y + dy })));
    });
    $("prop-w").addEventListener("change", () => {
      const b = State.selectedBlocks()[0];
      const w = Math.max(10, num("prop-w"));
      const u = { id: b.id, w };
      if (b.type === "image" && b.lockRatio) u.h = Math.round((b.h / b.w) * w);
      State.updateBlocks([u]);
    });
    $("prop-h").addEventListener("change", () => {
      const b = State.selectedBlocks()[0];
      const h = Math.max(10, num("prop-h"));
      const u = { id: b.id, h };
      if (b.type === "image" && b.lockRatio) u.w = Math.round((b.w / b.h) * h);
      State.updateBlocks([u]);
    });

    $("prop-lock-ratio").addEventListener("change", (e) => updateSingle({ lockRatio: e.target.checked }));
    $("prop-label").addEventListener("change", (e) => updateSingle({ label: e.target.value.trim() }));
    $("prop-text").addEventListener("input", (e) => updateSingle({ text: e.target.value }));
    $("prop-font-size").addEventListener("change", () => updateSingle({ fontSize: Math.max(8, num("prop-font-size")) }));
    $("prop-align").addEventListener("change", (e) => updateSingle({ align: e.target.value }));
    $("prop-bold").addEventListener("change", (e) => updateSingle({ bold: e.target.checked }));
    $("prop-locked").addEventListener("change", (e) => {
      State.updateBlocks(State.selectedBlocks().map((b) => ({ id: b.id, locked: e.target.checked })));
    });

    // aspect ratio buttons keep width, change height
    const grid = $("ratio-grid");
    for (const [label, ratio] of RATIOS) {
      const btn = document.createElement("button");
      btn.className = "ratio-btn";
      btn.textContent = label;
      btn.dataset.ratio = ratio;
      btn.addEventListener("click", () => {
        const b = State.selectedBlocks()[0];
        if (b) State.updateBlocks([{ id: b.id, h: Math.round(b.w / ratio) }]);
      });
      grid.appendChild(btn);
    }

    $("btn-duplicate").addEventListener("click", duplicateSelection);
    $("btn-delete").addEventListener("click", deleteSelection);
    $("btn-bring-front").addEventListener("click", () => State.reorder(selectedIds(), "front"));
    $("btn-send-back").addEventListener("click", () => State.reorder(selectedIds(), "back"));

    document.querySelectorAll("[data-align]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const updates = Layout.align(State.selectedBlocks(), btn.dataset.align);
        if (updates.length) State.updateBlocks(updates);
      });
    });
  }

  function num(id) {
    return parseInt($(id).value, 10) || 0;
  }

  function updateSingle(props) {
    const b = State.selectedBlocks()[0];
    if (b) State.updateBlocks([{ id: b.id, ...props }]);
  }

  /* ---------- presets panel ---------- */

  const THUMB_W = 220;

  function renderPresets() {
    const list = $("presets-list");
    list.innerHTML = "";
    const canvasW = 1440;

    Presets.list.forEach((preset) => {
      const blocks = Presets.build(preset, canvasW, 0, false);
      const height = blocks.reduce((m, b) => Math.max(m, b.y + b.h), 0) + Presets.MARGIN;
      const scale = THUMB_W / canvasW;

      const card = document.createElement("button");
      card.className = "preset";
      card.innerHTML = `<div class="preset__name">${preset.name}</div><div class="preset__desc">${preset.desc}</div>`;

      const thumb = document.createElement("div");
      thumb.className = "preset__thumb";
      thumb.style.height = Math.round(height * scale) + "px";
      for (const b of blocks) {
        const el = document.createElement("div");
        el.className = "preset__thumb-block" + (b.type === "text" ? " preset__thumb-block--text" : "");
        el.style.left = b.x * scale + "px";
        el.style.top = b.y * scale + "px";
        el.style.width = b.w * scale + "px";
        el.style.height = Math.max(2, b.h * scale) + "px";
        thumb.appendChild(el);
      }
      card.appendChild(thumb);
      card.addEventListener("click", () => appendPreset(preset));
      list.appendChild(card);
    });
  }

  function togglePresets(force) {
    const panel = $("presets-panel");
    panel.classList.toggle("is-open", force);
    Canvas.render();
  }

  /* ---------- toolbar ---------- */

  function bindToolbar() {
    $("btn-add-image").addEventListener("click", () => placeAtCenter("image"));
    $("btn-add-text").addEventListener("click", () => placeAtCenter("text"));
    $("btn-presets").addEventListener("click", () => togglePresets());
    $("btn-close-presets").addEventListener("click", () => togglePresets(false));
    $("btn-auto-layout").addEventListener("click", runAutoLayout);

    document.querySelectorAll("#device-switch .segmented__item").forEach((btn) => {
      btn.addEventListener("click", () => {
        State.setDevice(btn.dataset.device);
        document.querySelectorAll("#device-switch .segmented__item").forEach((b) => b.classList.toggle("is-active", b === btn));
        Canvas.zoomToFit();
      });
    });

    $("btn-undo").addEventListener("click", State.undo);
    $("btn-redo").addEventListener("click", State.redo);
    $("btn-zoom-in").addEventListener("click", () => Canvas.setZoom(State.state.zoom * 1.25));
    $("btn-zoom-out").addEventListener("click", () => Canvas.setZoom(State.state.zoom / 1.25));
    $("btn-zoom-fit").addEventListener("click", Canvas.zoomToFit);

    $("btn-save").addEventListener("click", () => Exporter.download("layout.json", State.serialize(), "application/json"));
    $("btn-load").addEventListener("click", () => $("file-input").click());
    $("file-input").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        State.load(await file.text());
        syncDeviceSwitch();
        Canvas.zoomToFit();
      } catch (err) {
        console.error("[app] load failed", err);
        alert("Could not load this file: " + err.message);
      }
      e.target.value = "";
    });

    $("btn-export-html").addEventListener("click", () => {
      const html = Exporter.toHtml(State.currentBlocks(), State.canvasWidth(), State.DEVICES[State.state.device].label);
      Exporter.download(`layout-${State.state.device}.html`, html, "text/html");
    });
    $("btn-export-png").addEventListener("click", async () => {
      const blob = await Exporter.toPng(State.currentBlocks(), State.canvasWidth());
      Exporter.download(`layout-${State.state.device}.png`, blob);
    });
    $("btn-clear").addEventListener("click", () => {
      if (!State.currentBlocks().length) return;
      if (confirm(`Clear the ${State.state.device} canvas?`)) State.clearCanvas();
    });
  }

  function syncDeviceSwitch() {
    document.querySelectorAll("#device-switch .segmented__item").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.device === State.state.device);
    });
  }

  /* ---------- keyboard ---------- */

  function bindKeyboard() {
    window.addEventListener("keydown", (e) => {
      if (Canvas.isEditing() || isTypingInField()) {
        if (e.key === "Escape") document.activeElement.blur();
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === "z") { e.preventDefault(); e.shiftKey ? State.redo() : State.undo(); return; }
      if (mod && key === "y") { e.preventDefault(); State.redo(); return; }
      if (mod && key === "d") { e.preventDefault(); duplicateSelection(); return; }
      if (mod && key === "c") { e.preventDefault(); copySelection(); return; }
      if (mod && key === "v") { e.preventDefault(); paste(); return; }
      if (mod && key === "a") { e.preventDefault(); State.selectAll(); return; }
      if (mod && (key === "=" || key === "+")) { e.preventDefault(); Canvas.setZoom(State.state.zoom * 1.25); return; }
      if (mod && key === "-") { e.preventDefault(); Canvas.setZoom(State.state.zoom / 1.25); return; }
      if (mod && key === "0") { e.preventDefault(); Canvas.zoomToFit(); return; }
      if (mod) return;

      const step = e.shiftKey ? 10 : 1;
      switch (e.key) {
        case "Delete":
        case "Backspace": e.preventDefault(); deleteSelection(); break;
        case "Escape": State.clearSelection(); togglePresets(false); break;
        case "ArrowLeft": e.preventDefault(); nudge(-step, 0); break;
        case "ArrowRight": e.preventDefault(); nudge(step, 0); break;
        case "ArrowUp": e.preventDefault(); nudge(0, -step); break;
        case "ArrowDown": e.preventDefault(); nudge(0, step); break;
        case "i": case "I": placeAtCenter("image"); break;
        case "t": case "T": placeAtCenter("text"); break;
        case "p": case "P": togglePresets(); break;
        case "a": case "A": runAutoLayout(); break;
        case "l": case "L": toggleLock(); break;
      }
    });
  }

  /* ---------- init ---------- */

  function init() {
    const restored = State.loadLocal();
    bindToolbar();
    bindProps();
    bindKeyboard();
    renderPresets();
    syncDeviceSwitch();

    State.subscribe(renderProps);
    State.subscribe(Utils.debounce(State.saveLocal, 400));

    Canvas.init();
    Canvas.zoomToFit();
    renderProps();

    // first visit: show something on the board
    if (!restored) appendPreset(Presets.list[1]);
    console.info("[app] ready", { restored, blocks: State.currentBlocks().length });
  }

  document.addEventListener("DOMContentLoaded", init);

  return { isTypingInField, setCursorStatus };
})();
