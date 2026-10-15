const RIPPLE_TARGETS = '.btn, .icon-btn, .segmented button, .nb-item, .row';

// Material-style ink ripple on any matching element, via one delegated listener.
export function installRipple() {
  document.addEventListener('pointerdown', (e) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = e.target.closest(RIPPLE_TARGETS);
    if (!el || e.target.closest('input, textarea, select')) return;
    const rect = el.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const ink = document.createElement('span');
    ink.className = 'ripple';
    ink.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size / 2}px;top:${e.clientY - rect.top - size / 2}px`;
    el.appendChild(ink);
    ink.addEventListener('animationend', () => ink.remove());
  });
}
