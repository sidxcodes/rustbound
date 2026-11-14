// Keyboard and mouse state. Systems read from here; nothing else touches DOM input events.
export class Input {
  constructor(canvas) {
    this.down = new Set();
    this.pressed = new Set();
    this.mouse = { x: 0, y: 0, nx: 0, ny: 0, down: false, clicked: false };
    this.wheel = 0;
    this.enabled = true;
    const isTyping = (e) => /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
    window.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    canvas.addEventListener('mousemove', (e) => this.setMouse(e, canvas));
    canvas.addEventListener('mousedown', (e) => {
      this.setMouse(e, canvas);
      if (e.button === 0) { this.mouse.down = true; this.mouse.clicked = true; }
    });
    window.addEventListener('mouseup', () => (this.mouse.down = false));
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  setMouse(e, canvas) {
    const r = canvas.getBoundingClientRect();
    this.mouse.x = e.clientX - r.left;
    this.mouse.y = e.clientY - r.top;
    this.mouse.nx = (this.mouse.x / r.width) * 2 - 1;
    this.mouse.ny = -(this.mouse.y / r.height) * 2 + 1;
  }
  held(...codes) { return this.enabled && codes.some((c) => this.down.has(c)); }
  hit(...codes) { return this.enabled && codes.some((c) => this.pressed.has(c)); }
  // Raw check that ignores `enabled`, for keys that must work while a panel is open.
  hitRaw(...codes) { return codes.some((c) => this.pressed.has(c)); }
  endFrame() { this.pressed.clear(); this.mouse.clicked = false; this.wheel = 0; }
}
