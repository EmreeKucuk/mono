// Reconcile layout by widget ID. Existing editor DOM and handlers stay alive.
export function patchGrid(desk, widgets, columns, rows, { card, style, bind }) {
  let surface = desk.querySelector('.grid-surface');
  if (!surface) {
    surface = document.createElement('div');
    surface.className = 'grid-surface';
    desk.replaceChildren(surface);
  }
  const focused = document.activeElement;
  const selection = getSelection();
  const savedSelection = selection?.rangeCount && surface.contains(selection.anchorNode)
    ? { anchor: selection.anchorNode, anchorOffset: selection.anchorOffset, focus: selection.focusNode, focusOffset: selection.focusOffset }
    : null;
  surface.style.setProperty('--columns', columns);
  surface.style.gridTemplateRows = `repeat(${rows},var(--cell-size))`;
  surface.querySelectorAll('.grid-cell').forEach(cell => cell.remove());
  const cells = document.createDocumentFragment();
  for (let slot = 0; slot < rows * columns; slot++) {
    const cell = document.createElement('div');
    cell.className = 'grid-cell';
    cell.setAttribute('aria-hidden', 'true');
    cell.style.cssText = style({ slot, cols: 1, rows: 1 }, columns);
    const label = document.createElement('span');
    label.textContent = slot + 1;
    cell.append(label);
    cells.append(cell);
  }
  surface.prepend(cells);
  const ids = new Set(widgets.map(widget => widget.id));
  surface.querySelectorAll('.widget').forEach(node => { if (!ids.has(node.dataset.id)) node.remove(); });
  for (const widget of widgets) {
    let node = surface.querySelector(`[data-id="${widget.id}"]`);
    if (!node) {
      const template = document.createElement('template');
      template.innerHTML = card(widget, columns);
      node = template.content.firstElementChild;
      surface.append(node);
      bind(node);
    }
    node.style.cssText = style(widget.grid, columns);
    node.dataset.gridCols=String(widget.grid.cols);
    node.dataset.gridRows=String(widget.grid.rows);
    node.querySelector('.resize-handle')?.setAttribute('aria-label', `${widget.title} boyutu ${widget.grid.cols} sütun, ${widget.grid.rows} satır; ok tuşlarıyla değiştir`);
  }
  // Avoid detaching live iframe players on every grid reconciliation.
  for(let index=0;index<widgets.length;index++) {
    const existing=[...surface.querySelectorAll(':scope > .widget')];
    const node=existing.find(card=>card.dataset.id===widgets[index].id);
    if(node===existing[index])continue;
    const before=existing[index]||null;
    if(typeof surface.moveBefore==='function')surface.moveBefore(node,before);
    else surface.insertBefore(node,before);
  }
  if (focused?.isConnected && surface.contains(focused)) focused.focus({ preventScroll: true });
  if (savedSelection?.anchor.isConnected && savedSelection.focus.isConnected) {
    selection.setBaseAndExtent(savedSelection.anchor, savedSelection.anchorOffset, savedSelection.focus, savedSelection.focusOffset);
  }
}
