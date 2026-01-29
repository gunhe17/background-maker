/**
 * Control panel UI logic.
 * Manages collapsible sections, per-layer configuration, and live preview binding.
 */

import { renderer, SHAPE_TYPES, MOTION_TYPES, BLEND_MODES } from './aurora.js';

// ── Constants ──

const DEFAULT_COLORS = ['#7c7cff', '#3b82f6', '#a855f7', '#22d3ee', '#f472b6', '#34d399'];

// ── SVG Icons ──

const SHAPE_ICONS = {
  circle:  '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5"/></svg>',
  ellipse: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><ellipse cx="10" cy="10" rx="8" ry="5" stroke="currentColor" stroke-width="1.5"/></svg>',
  ring:    '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="10" r="4" stroke="currentColor" stroke-width="1" opacity="0.4"/></svg>',
  blob:    '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 3C13 3 17 5.5 16 10C15 14.5 13 17 10 17C7 17 4 14.5 4 10C4 5.5 7 3 10 3Z" stroke="currentColor" stroke-width="1.5"/></svg>',
};

const MOTION_ICONS = {
  lissajous: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 10C5 4 8 4 10 10C12 16 15 16 17 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  orbit:     '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><ellipse cx="10" cy="10" rx="7" ry="4" stroke="currentColor" stroke-width="1.5" transform="rotate(-20 10 10)"/><circle cx="14" cy="8" r="1.5" fill="currentColor"/></svg>',
  drift:     '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 14L10 6L16 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  breathe:   '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="4" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1" opacity="0.3" stroke-dasharray="2 2"/></svg>',
  wave:      '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M2 10C4 6 6 6 8 10C10 14 12 14 14 10C16 6 18 6 20 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
};

// ── Dropdown options ──

const SHAPE_OPTIONS = [
  { value: 'circle',  label: 'Circle',  icon: SHAPE_ICONS.circle,  desc: '정원형. 중심이 밝고 가장자리로 갈수록 투명해지는 기본 형태.' },
  { value: 'ellipse', label: 'Ellipse', icon: SHAPE_ICONS.ellipse, desc: '납작한 타원형. 레이어마다 납작한 정도가 다르게 적용되어 변화감을 줌.' },
  { value: 'ring',    label: 'Ring',    icon: SHAPE_ICONS.ring,    desc: '고리 모양. 중심이 비어있고 테두리 부분이 밝은 도넛형 빛.' },
  { value: 'blob',    label: 'Blob',    icon: SHAPE_ICONS.blob,    desc: '불규칙한 유기적 형태. 레이어마다 고유한 울퉁불퉁 모양이 자동 생성됨.' },
];

const MOTION_OPTIONS = [
  { value: 'lissajous', label: 'Lissajous', icon: MOTION_ICONS.lissajous, desc: '8자 또는 나비 모양의 부드러운 궤적. 가로·세로 방향이 다른 리듬으로 움직여 복잡한 패턴이 만들어짐.' },
  { value: 'orbit',     label: 'Orbit',     icon: MOTION_ICONS.orbit,     desc: '중심점을 기준으로 원형/타원형 궤도를 도는 움직임. 행성이 공전하는 듯한 규칙적 순환.' },
  { value: 'drift',     label: 'Drift',     icon: MOTION_ICONS.drift,     desc: '한쪽 방향으로 천천히 흘러가며 위아래로 살짝 흔들리는 움직임. 구름이 흘러가는 느낌.' },
  { value: 'breathe',   label: 'Breathe',   icon: MOTION_ICONS.breathe,   desc: '위치 이동 없이 제자리에서 크기만 커졌다 작아지는 숨쉬기 효과. Scale 변화가 추가로 강화됨.' },
  { value: 'wave',      label: 'Wave',      icon: MOTION_ICONS.wave,      desc: '좌우로 크게 흔들리며 위아래로 작은 물결을 그리는 움직임. 파도나 해초가 흔들리는 느낌.' },
];

const LAYER_SLIDERS = [
  { prop: 'cycles',  key: 'layerCycles',        min: 1,   max: 6,   step: 1,    def: 1,    fmt: v => Math.round(v), hint: "루프 1회 동안 이 덩어리가 궤적을 완주하는 횟수입니다. 정수만 허용되며, 이를 통해 영상의 끝과 시작이 수학적으로 정확히 이어집니다.<div class='hint-vals'><span class='hint-val'><b>1</b> 느리고 여유로운 움직임</span><span class='hint-val'><b>2~3</b> 적당히 역동적</span><span class='hint-val'><b>4~6</b> 빠르고 복잡한 움직임</span></div>" },
  { prop: 'range',   key: 'layerMotionRanges',  min: 50,  max: 600, step: 10,   def: 250,  fmt: v => Math.round(v), hint: "이 덩어리가 돌아다니는 범위입니다.<div class='hint-vals'><span class='hint-val'><b>50</b> 제자리에서 살짝 흔들림</span><span class='hint-val'><b>250</b> 화면 중간 정도 이동</span><span class='hint-val'><b>600</b> 화면 전체를 크게 이동</span></div>" },
  { prop: 'opacity', key: 'layerOpacities',     min: 0.1, max: 1,   step: 0.05, def: 0.75, fmt: v => v.toFixed(2),  hint: "이 덩어리의 투명도입니다.<div class='hint-vals'><span class='hint-val'><b>0.1</b> 거의 보이지 않는 은은한 색감</span><span class='hint-val'><b>0.75</b> 적당히 또렷함</span><span class='hint-val'><b>1.0</b> 완전히 불투명한 진한 색상</span></div>" },
  { prop: 'scale',   key: 'layerScaleRanges',   min: 1,   max: 2,   step: 0.05, def: 1.4,  fmt: v => v.toFixed(2),  hint: "이 덩어리가 커졌다 작아지는 정도입니다.<div class='hint-vals'><span class='hint-val'><b>1.0</b> 크기 변화 없음 (고정)</span><span class='hint-val'><b>1.4</b> 자연스럽게 숨 쉬듯 변화</span><span class='hint-val'><b>2.0</b> 강한 맥동 효과</span></div>" },
];

// ── Helpers ──

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ═══════════════════════════════════════════
// Icon dropdown component
// ═══════════════════════════════════════════

/**
 * Creates a custom dropdown with SVG icon previews.
 * @param {Array<{value:string, label:string, icon:string}>} options
 * @param {string} currentValue
 * @param {(value:string)=>void} onChange
 * @returns {HTMLElement}
 */
function createIconDropdown(options, currentValue, onChange) {
  const wrapper = document.createElement('div');
  wrapper.className = 'icon-dropdown';

  const current = options.find(o => o.value === currentValue) || options[0];

  // Selected display
  const selected = document.createElement('button');
  selected.type = 'button';
  selected.className = 'icon-dropdown-selected';
  selected.innerHTML = `
    <span class="icon-dropdown-icon">${current.icon}</span>
    <span class="icon-dropdown-label">${current.label}</span>
    <span class="icon-dropdown-arrow">›</span>
  `;

  // Dropdown menu
  const menu = document.createElement('div');
  menu.className = 'icon-dropdown-menu';

  for (const opt of options) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'icon-dropdown-item' + (opt.value === currentValue ? ' active' : '');
    item.dataset.value = opt.value;
    item.innerHTML = `
      <span class="icon-dropdown-icon">${opt.icon}</span>
      <span class="icon-dropdown-text">
        <span class="icon-dropdown-label">${opt.label}</span>
        ${opt.desc ? `<span class="icon-dropdown-desc">${opt.desc}</span>` : ''}
      </span>
    `;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      // Update selected display
      selected.querySelector('.icon-dropdown-icon').innerHTML = opt.icon;
      selected.querySelector('.icon-dropdown-label').textContent = opt.label;
      // Update active state
      menu.querySelectorAll('.icon-dropdown-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      // Close & callback
      wrapper.classList.remove('open');
      menu.style.display = 'none';
      onChange(opt.value);
    });
    menu.appendChild(item);
  }

  selected.addEventListener('click', (e) => {
    e.stopPropagation();
    // Close all other open dropdowns
    document.querySelectorAll('.icon-dropdown.open').forEach(d => {
      if (d !== wrapper) d.classList.remove('open');
    });
    wrapper.classList.toggle('open');
    // Position the fixed menu below the selected button
    if (wrapper.classList.contains('open')) {
      const rect = selected.getBoundingClientRect();
      const menuWidth = Math.max(rect.width, 220);
      // Align right edge with the selected button's right edge
      menu.style.left = `${rect.right - menuWidth}px`;
      menu.style.top = `${rect.bottom + 4}px`;
      menu.style.width = `${menuWidth}px`;
      menu.style.display = 'block';
    } else {
      menu.style.display = 'none';
    }
  });

  wrapper.appendChild(selected);
  // Append menu to body to escape overflow/backdrop-filter containing block
  document.body.appendChild(menu);
  return wrapper;
}

// Close icon dropdowns on outside click
document.addEventListener('click', () => {
  document.querySelectorAll('.icon-dropdown.open').forEach(d => d.classList.remove('open'));
  document.querySelectorAll('.icon-dropdown-menu').forEach(m => m.style.display = 'none');
});

// ═══════════════════════════════════════════
// Panel position & minimize
// ═══════════════════════════════════════════

const panel = document.getElementById('control-panel');
const minimizeBtn = document.getElementById('panel-minimize');
const restoreBtn = document.getElementById('panel-restore');

minimizeBtn.addEventListener('click', () => {
  panel.style.opacity = '0';
  panel.style.pointerEvents = 'none';
  panel.style.transform = 'scale(0.95)';
  restoreBtn.classList.remove('hidden');
  restoreBtn.classList.add('flex');
});

restoreBtn.addEventListener('click', () => {
  panel.style.opacity = '';
  panel.style.pointerEvents = '';
  panel.style.transform = '';
  restoreBtn.classList.add('hidden');
  restoreBtn.classList.remove('flex');
});

// ═══════════════════════════════════════════
// Collapsible section toggles
// ═══════════════════════════════════════════

function initSectionToggles() {
  document.querySelectorAll('.panel-section-toggle').forEach(toggle => {
    toggle.addEventListener('click', (e) => {
      // Don't toggle if clicking the hint button
      if (e.target.closest('.hint-btn')) return;
      const section = toggle.closest('.panel-section');
      section.classList.toggle('open');
    });
  });

  // Open all sections by default
  document.querySelectorAll('.panel-section').forEach(s => s.classList.add('open'));
}

// ═══════════════════════════════════════════
// Global controls binding
// ═══════════════════════════════════════════

function bindRange(id, settingKey, formatter) {
  const input = document.getElementById(id);
  const valSpan = document.getElementById(`${id}-val`);

  const update = () => {
    const val = parseFloat(input.value);
    renderer.updateSettings({ [settingKey]: val });
    valSpan.textContent = formatter ? formatter(val) : val;
    if (settingKey === 'blur') renderer.updateBlur();
  };

  input.addEventListener('input', update);
  update();
}

const bgColorInput = document.getElementById('bg-color');
const blendModeSelect = document.getElementById('blend-mode');
let blendModeManual = false; // true if user explicitly picked a blend mode

/** Parse hex color to relative luminance (0 = black, 1 = white). */
function hexLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Auto-select blend mode based on background brightness. */
function autoBlendMode(hex) {
  const lum = hexLuminance(hex);
  // dark → screen (additive light), bright → multiply (subtractive color)
  return lum > 0.5 ? 'multiply' : 'screen';
}

bgColorInput.addEventListener('input', () => {
  const color = bgColorInput.value;
  renderer.updateSettings({ bgColor: color });
  if (!blendModeManual) {
    const mode = autoBlendMode(color);
    blendModeSelect.value = mode;
    renderer.updateSettings({ blendMode: mode });
  }
});

bindRange('blur', 'blur', v => Math.round(v));

// Blend mode
blendModeSelect.addEventListener('change', () => {
  blendModeManual = true;
  renderer.updateSettings({ blendMode: blendModeSelect.value });
});

// ═══════════════════════════════════════════
// Per-layer configuration
// ═══════════════════════════════════════════

const layerCountInput = document.getElementById('layer-count');
const layerCountVal = document.getElementById('layer-count-val');
const layerConfigsContainer = document.getElementById('layer-configs');

function buildLayerConfigs() {
  const count = parseInt(layerCountInput.value);
  layerConfigsContainer.innerHTML = '';
  const s = renderer.settings;

  for (let i = 0; i < count; i++) {
    // Ensure defaults
    const color  = s.layerColors[i]  || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
    const shape  = s.layerShapes[i]  || SHAPE_TYPES.circle;
    const motion = s.layerMotions[i] || MOTION_TYPES.lissajous;

    s.layerColors[i]  = color;
    s.layerShapes[i]  = shape;
    s.layerMotions[i] = motion;

    for (const sl of LAYER_SLIDERS) {
      if (s[sl.key][i] == null) s[sl.key][i] = sl.def;
    }

    // Build collapsible layer item
    const item = document.createElement('div');
    item.className = 'layer-item';
    item.dataset.layer = i;

    // Toggle header with color swatch preview
    const header = document.createElement('button');
    header.className = 'layer-item-toggle';
    header.type = 'button';
    header.innerHTML = `
      <span class="layer-item-chevron">›</span>
      <span class="layer-item-label">Layer ${i + 1}</span>
      <span class="layer-color-swatch" style="background: ${color}"></span>
    `;
    header.addEventListener('click', () => item.classList.toggle('open'));

    // Body
    const body = document.createElement('div');
    body.className = 'layer-item-body';

    const content = document.createElement('div');
    content.className = 'layer-item-content';

    // Color row
    const colorRow = document.createElement('div');
    colorRow.className = 'layer-config-row';
    colorRow.innerHTML = `
      <span class="layer-config-row-label">Color</span>
      <input type="color" value="${color}" data-layer="${i}" class="color-input color-input-sm layer-color-picker" />
    `;
    content.appendChild(colorRow);

    // Shape icon dropdown row
    const shapeRow = document.createElement('div');
    shapeRow.className = 'layer-config-row';
    const shapeLabel = document.createElement('span');
    shapeLabel.className = 'layer-config-row-label';
    shapeLabel.textContent = 'Shape';
    shapeRow.appendChild(shapeLabel);
    shapeRow.appendChild(createIconDropdown(SHAPE_OPTIONS, shape, (val) => {
      renderer.settings.layerShapes[i] = val;
    }));
    content.appendChild(shapeRow);

    // Motion icon dropdown row
    const motionRow = document.createElement('div');
    motionRow.className = 'layer-config-row';
    const motionLabel = document.createElement('span');
    motionLabel.className = 'layer-config-row-label';
    motionLabel.textContent = 'Motion';
    motionRow.appendChild(motionLabel);
    motionRow.appendChild(createIconDropdown(MOTION_OPTIONS, motion, (val) => {
      renderer.settings.layerMotions[i] = val;
    }));
    content.appendChild(motionRow);

    // Slider rows
    for (const sl of LAYER_SLIDERS) {
      const val = s[sl.key][i];
      const row = document.createElement('div');
      row.className = 'layer-config-row';
      row.innerHTML = `
        <span class="layer-config-row-label">${capitalize(sl.prop)} <span class="hint-btn" data-hint="${sl.hint}">i</span></span>
        <div class="layer-config-row-input">
          <input type="range" min="${sl.min}" max="${sl.max}" step="${sl.step}" value="${val}"
                 data-layer="${i}" data-prop="${sl.prop}" data-key="${sl.key}"
                 class="slider slider-sm layer-slider" />
          <span class="layer-config-val" data-layer="${i}" data-valprop="${sl.prop}">${sl.fmt(val)}</span>
        </div>
      `;
      content.appendChild(row);
    }

    body.appendChild(content);
    item.appendChild(header);
    item.appendChild(body);
    layerConfigsContainer.appendChild(item);
  }

  bindLayerEvents();
}

function bindLayerEvents() {
  const container = layerConfigsContainer;

  // Color pickers
  container.querySelectorAll('.layer-color-picker').forEach(picker => {
    picker.addEventListener('input', e => {
      const idx = parseInt(e.target.dataset.layer);
      renderer.settings.layerColors[idx] = e.target.value;
      const swatch = container.querySelector(`.layer-item[data-layer="${idx}"] .layer-color-swatch`);
      if (swatch) swatch.style.background = e.target.value;
    });
  });

  // Per-layer sliders
  container.querySelectorAll('.layer-slider').forEach(slider => {
    slider.addEventListener('input', e => {
      const idx = parseInt(e.target.dataset.layer);
      const prop = e.target.dataset.prop;
      const key = e.target.dataset.key;
      const val = parseFloat(e.target.value);

      renderer.settings[key][idx] = val;

      const valSpan = container.querySelector(
        `.layer-config-val[data-layer="${idx}"][data-valprop="${prop}"]`
      );
      if (valSpan) {
        const slDef = LAYER_SLIDERS.find(s => s.prop === prop);
        valSpan.textContent = slDef ? slDef.fmt(val) : val;
      }
    });
  });
}

layerCountInput.addEventListener('input', () => {
  const count = parseInt(layerCountInput.value);
  layerCountVal.textContent = count;
  renderer.updateSettings({ layerCount: count });
  buildLayerConfigs();
});

// ═══════════════════════════════════════════
// Export duration → preview loop binding
// ═══════════════════════════════════════════

const durationInput = document.getElementById('duration');
function syncLoopDuration() {
  const raw = parseInt(durationInput.value);
  const sec = Number.isFinite(raw) && raw >= 1 ? Math.min(raw, 120) : 10;
  renderer.updateSettings({ loopDuration: sec * 1000 });
}
// Allow only digits while typing
durationInput.addEventListener('input', () => {
  durationInput.value = durationInput.value.replace(/[^0-9]/g, '');
  syncLoopDuration();
});
// Clamp and restore on blur (empty → default 10)
durationInput.addEventListener('blur', () => {
  const raw = parseInt(durationInput.value);
  const sec = Number.isFinite(raw) && raw >= 1 ? Math.min(raw, 120) : 10;
  durationInput.value = sec;
  syncLoopDuration();
});
syncLoopDuration();

// ═══════════════════════════════════════════
// Init
// ═══════════════════════════════════════════

initSectionToggles();
buildLayerConfigs();

// ═══════════════════════════════════════════
// Hint tooltip
// ═══════════════════════════════════════════

const tooltip = document.getElementById('hint-tooltip');
let hideTimeout = null;

document.addEventListener('mouseenter', (e) => {
  if (!e.target?.closest) return;
  const btn = e.target.closest('.hint-btn');
  if (!btn) return;
  const hint = btn.dataset.hint;
  if (!hint) return;

  clearTimeout(hideTimeout);
  tooltip.innerHTML = hint;

  // Make visible off-screen first to measure actual size
  tooltip.style.left = '-9999px';
  tooltip.style.top = '-9999px';
  tooltip.classList.add('visible');

  const rect = btn.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const gap = 8;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Try left side first, fallback to right if not enough space
  let left = rect.left - tooltipRect.width - gap;
  if (left < gap) {
    left = rect.right + gap;
  }

  // Vertical: align top with button, but keep within viewport
  let top = rect.top;
  if (top + tooltipRect.height > viewportHeight - gap) {
    top = viewportHeight - tooltipRect.height - gap;
  }
  if (top < gap) {
    top = gap;
  }

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}, true);

document.addEventListener('mouseleave', (e) => {
  if (!e.target?.closest) return;
  const btn = e.target.closest('.hint-btn');
  if (!btn) return;
  hideTimeout = setTimeout(() => {
    tooltip.classList.remove('visible');
  }, 100);
}, true);
