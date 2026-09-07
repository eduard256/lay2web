/**
 * Application state: devices, blocks, selection, undo/redo, persistence.
 * Pure data — no DOM access here.
 */
const State = (() => {
  const DEVICES = {
    // screenRatio = width / height of one visible screen (the "fold")
    desktop: { width: 1440, screenRatio: 16 / 9, label: "Desktop" },
    mobile: { width: 390, screenRatio: 9 / 16, label: "Mobile" },
  };

  const STORAGE_KEY = "lay2web:v1";
  const MAX_HISTORY = 100;

  let nextId = 1;

  const state = {
    device: "desktop",
    layouts: {
      desktop: { blocks: [] },
      mobile: { blocks: [] },
    },
    selection: new Set(),
    zoom: 1,
  };

  const history = { past: [], future: [] };
  const listeners = new Set();

  /* ---------- helpers ---------- */

  function uid() {
    return "b" + nextId++;
  }

  function currentBlocks() {
    return state.layouts[state.device].blocks;
  }

  function canvasWidth() {
    return DEVICES[state.device].width;
  }

  /** Height of one screen: 16:9 on desktop, 9:16 on mobile. */
  function screenHeight() {
    const d = DEVICES[state.device];
    return Math.round(d.width / d.screenRatio);
  }

  function getBlock(id) {
    return currentBlocks().find((b) => b.id === id) || null;
  }

  function selectedBlocks() {
    return currentBlocks().filter((b) => state.selection.has(b.id));
  }

  /** Bottom edge of the lowest block, 0 if canvas is empty. */
  function contentBottom() {
    return currentBlocks().reduce((max, b) => Math.max(max, b.y + b.h), 0);
  }

  function round(n) {
    return Math.round(n);
  }

  /* ---------- block factories ---------- */

  function createImageBlock(props = {}) {
    return {
      id: uid(),
      type: "image",
      x: 0,
      y: 0,
      w: 400,
      h: 300,
      lockRatio: true,
      label: "",
      locked: false,
      ...props,
    };
  }

  function createTextBlock(props = {}) {
    return {
      id: uid(),
      type: "text",
      x: 0,
      y: 0,
      w: 400,
      h: 60,
      text: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
      fontSize: 18,
      align: "left",
      bold: false,
      locked: false,
      ...props,
    };
  }

  /* ---------- history ---------- */

  function snapshot() {
    return JSON.stringify(state.layouts);
  }

  /** Call before a mutation so it can be undone. */
  function commit() {
    history.past.push(snapshot());
    if (history.past.length > MAX_HISTORY) history.past.shift();
    history.future.length = 0;
  }

  function restore(json) {
    state.layouts = JSON.parse(json);
    const ids = new Set(currentBlocks().map((b) => b.id));
    state.selection = new Set([...state.selection].filter((id) => ids.has(id)));
    emit();
  }

  function undo() {
    if (!history.past.length) return;
    history.future.push(snapshot());
    restore(history.past.pop());
  }

  function redo() {
    if (!history.future.length) return;
    history.past.push(snapshot());
    restore(history.future.pop());
  }

  /* ---------- mutations ---------- */

  function addBlocks(blocks, { select = true } = {}) {
    commit();
    currentBlocks().push(...blocks);
    if (select) state.selection = new Set(blocks.map((b) => b.id));
    emit();
    return blocks;
  }

  function removeBlocks(ids) {
    if (!ids.length) return;
    commit();
    const set = new Set(ids);
    state.layouts[state.device].blocks = currentBlocks().filter((b) => !set.has(b.id));
    ids.forEach((id) => state.selection.delete(id));
    emit();
  }

  /** Apply partial props to blocks. Set `record=false` for live drag updates. */
  function updateBlocks(updates, { record = true } = {}) {
    if (record) commit();
    for (const { id, ...props } of updates) {
      const block = getBlock(id);
      if (block) Object.assign(block, props);
    }
    emit();
  }

  function duplicateBlocks(ids, offset = 24) {
    const source = currentBlocks().filter((b) => ids.includes(b.id));
    if (!source.length) return [];
    const copies = source.map((b) => ({ ...b, id: uid(), x: b.x + offset, y: b.y + offset }));
    return addBlocks(copies);
  }

  function reorder(ids, direction) {
    commit();
    const blocks = currentBlocks();
    const moving = blocks.filter((b) => ids.includes(b.id));
    const rest = blocks.filter((b) => !ids.includes(b.id));
    state.layouts[state.device].blocks = direction === "front" ? [...rest, ...moving] : [...moving, ...rest];
    emit();
  }

  function clearCanvas() {
    commit();
    state.layouts[state.device].blocks = [];
    state.selection.clear();
    emit();
  }

  function setDevice(device) {
    if (!DEVICES[device]) return;
    state.device = device;
    state.selection.clear();
    emit();
  }

  function setZoom(zoom) {
    state.zoom = Math.min(4, Math.max(0.1, zoom));
    emit();
  }

  /* ---------- selection ---------- */

  function select(ids, { additive = false } = {}) {
    if (!additive) state.selection.clear();
    ids.forEach((id) => state.selection.add(id));
    emit();
  }

  function toggleSelect(id) {
    if (state.selection.has(id)) state.selection.delete(id);
    else state.selection.add(id);
    emit();
  }

  function clearSelection() {
    if (!state.selection.size) return;
    state.selection.clear();
    emit();
  }

  function selectAll() {
    state.selection = new Set(currentBlocks().map((b) => b.id));
    emit();
  }

  /* ---------- persistence ---------- */

  function serialize() {
    return JSON.stringify({ version: 1, device: state.device, layouts: state.layouts }, null, 2);
  }

  function load(json) {
    const data = typeof json === "string" ? JSON.parse(json) : json;
    if (!data || !data.layouts) throw new Error("Invalid layout file");
    commit();
    state.layouts = {
      desktop: { blocks: data.layouts.desktop?.blocks || [] },
      mobile: { blocks: data.layouts.mobile?.blocks || [] },
    };
    if (DEVICES[data.device]) state.device = data.device;
    state.selection.clear();
    syncIdCounter();
    emit();
  }

  function syncIdCounter() {
    const all = [...state.layouts.desktop.blocks, ...state.layouts.mobile.blocks];
    const maxId = all.reduce((m, b) => Math.max(m, parseInt(String(b.id).slice(1), 10) || 0), 0);
    nextId = maxId + 1;
  }

  function saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, serialize());
    } catch (err) {
      console.warn("[state] localStorage save failed", err);
    }
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      state.layouts = data.layouts;
      if (DEVICES[data.device]) state.device = data.device;
      syncIdCounter();
      return true;
    } catch (err) {
      console.warn("[state] localStorage load failed", err);
      return false;
    }
  }

  /* ---------- events ---------- */

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function emit() {
    listeners.forEach((fn) => fn(state));
  }

  return {
    DEVICES,
    state,
    round,
    currentBlocks,
    canvasWidth,
    screenHeight,
    getBlock,
    selectedBlocks,
    contentBottom,
    createImageBlock,
    createTextBlock,
    commit,
    undo,
    redo,
    addBlocks,
    removeBlocks,
    updateBlocks,
    duplicateBlocks,
    reorder,
    clearCanvas,
    setDevice,
    setZoom,
    select,
    toggleSelect,
    clearSelection,
    selectAll,
    serialize,
    load,
    saveLocal,
    loadLocal,
    subscribe,
    emit,
  };
})();
