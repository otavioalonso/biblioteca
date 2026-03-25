export default function SettingsPanel({ settings, onChange, onClose, onDelete, onResetData }) {
  const update = (key, value) => onChange({ ...settings, [key]: value });

  const FONTS = [
    { value: 'default', label: 'Default' },
    // ── Serifs (Google Fonts) ──
    { value: "'EB Garamond', 'Garamond', Georgia, serif", label: 'EB Garamond' },
    { value: "'Baskervville', 'Baskerville', Georgia, serif", label: 'Baskervville' },
    { value: "'Literata', Georgia, serif", label: 'Literata' },
    { value: "'Lora', Georgia, serif", label: 'Lora' },
    { value: "'Ovo', Georgia, serif", label: 'Ovo' },
    // ── Sans-serifs (Google Fonts) ──
    { value: "'Lato', 'Helvetica Neue', sans-serif", label: 'Lato' },
    { value: "'Atkinson Hyperlegible', sans-serif", label: 'Atkinson' },
  ];

  const Stepper = ({ label, value, display, onDec, onInc }) => (
    <div className="s-row">
      <span className="s-label">{label}</span>
      <div className="s-ctrl">
        <button onClick={onDec}>−</button>
        <span className="s-val">{display}</span>
        <button onClick={onInc}>+</button>
      </div>
    </div>
  );

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <h3>Settings</h3>

        <div className="s-row">
          <span className="s-label">Font</span>
          <select
            value={settings.fontFamily}
            onChange={(e) => update('fontFamily', e.target.value)}
            style={{ fontFamily: settings.fontFamily !== 'default' ? settings.fontFamily : 'inherit' }}
          >
            {FONTS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>

        <div className="s-row">
          <span className="s-label">Theme</span>
          <select value={settings.theme} onChange={(e) => update('theme', e.target.value)}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="sepia">Sepia</option>
          </select>
        </div>

        <div className="s-row">
          <span className="s-label">Align</span>
          <select value={settings.textAlign ?? 'justify'} onChange={(e) => update('textAlign', e.target.value)}>
            <option value="justify">Justify</option>
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </div>

        <Stepper
          label="Font size"
          display={`${settings.fontSize}px`}
          onDec={() => update('fontSize', Math.max(1, settings.fontSize - 1))}
          onInc={() => update('fontSize', Math.min(36, settings.fontSize + 1))}
        />
        <Stepper
          label="Line height"
          display={settings.lineHeight.toFixed(1)}
          onDec={() => update('lineHeight', Math.max(1.0, +(settings.lineHeight - 0.1).toFixed(1)))}
          onInc={() => update('lineHeight', Math.min(3.0, +(settings.lineHeight + 0.1).toFixed(1)))}
        />
        <Stepper
          label="Paragraph spacing"
          display={`${settings.paragraphSpacing.toFixed(1)}em`}
          onDec={() => update('paragraphSpacing', Math.max(0, +(settings.paragraphSpacing - 0.5).toFixed(1)))}
          onInc={() => update('paragraphSpacing', Math.min(10, +(settings.paragraphSpacing + 0.5).toFixed(1)))}
        />
        <Stepper
          label="Margin (horizontal)"
          display={`${settings.marginH}px`}
          onDec={() => update('marginH', Math.max(0, settings.marginH - 5))}
          onInc={() => update('marginH', Math.min(200, settings.marginH + 5))}
        />
        <Stepper
          label="Margin (vertical)"
          display={`${settings.marginV}px`}
          onDec={() => update('marginV', Math.max(0, settings.marginV - 2))}
          onInc={() => update('marginV', Math.min(100, settings.marginV + 2))}
        />

        <div className="s-danger">
          <button
            className="btn btn-sm"
            onClick={() => {
            //   if (confirm('Reset all reading progress and stats for this book?')) {
                onResetData();
            //   }
            }}
          >
            Reset cache
          </button>
          <button
            className="btn btn-danger btn-sm"
            onClick={() => {
            //   if (confirm('Permanently delete this book and all its data?')) {
                onDelete();
            //   }
            }}
          >
            Delete book
          </button>
        </div>
{/* 
        <button className="btn btn-primary settings-done" onClick={onClose}>
          Done
        </button> */}
      </div>
    </div>
  );
}
