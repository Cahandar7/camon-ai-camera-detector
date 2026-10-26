import { useState } from 'react'
import { useI18n } from '../i18n/core'
import { clock } from '../lib/format'
import Icon from './Icon'
import Modal from './Modal'

export default function SettingsModal({ settings, health, onSave, onClearAlerts, onTestAlarm, onClose }) {
  const { t } = useI18n()
  const [form, setForm] = useState(settings)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: Number(e.target.value) }))

  const save = async () => {
    setSaving(true)
    try {
      await onSave(form)
      onClose()
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <Modal
      title={t('settings')}
      subtitle={t('settingsSub')}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost danger" onClick={onClearAlerts}>
            {t('clearHistory')}
          </button>
          <span className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {t('save')}
          </button>
        </>
      }
    >
      <div className="form">
        <Slider
          label={t('sConfidence')}
          value={t.pct(Math.round(form.confidence * 100))}
          hint={t('sConfidenceHint')}
          min={0.1}
          max={0.9}
          step={0.05}
          current={form.confidence}
          onChange={set('confidence')}
        />
        <Slider
          label={t('sThreshold')}
          value={t.pct(form.alert_threshold)}
          hint={t('sThresholdHint')}
          min={10}
          max={95}
          step={5}
          current={form.alert_threshold}
          onChange={set('alert_threshold')}
        />
        <Slider
          label={t('sDwell')}
          value={clock(form.dwell_alert_seconds)}
          hint={t('sDwellHint')}
          min={10}
          max={600}
          step={10}
          current={form.dwell_alert_seconds}
          onChange={set('dwell_alert_seconds')}
        />
        <Slider
          label={t('sConfirm')}
          value={`${form.confirm_seconds.toFixed(1)} ${t('secondsUnit')}`}
          hint={t('sConfirmHint')}
          min={0}
          max={5}
          step={0.5}
          current={form.confirm_seconds}
          onChange={set('confirm_seconds')}
        />
        {error && <div className="form-error">{error}</div>}

        <button type="button" className="btn btn-ghost alarm-test" onClick={onTestAlarm}>
          <Icon name="zap" size={16} /> {t('testAlarm')}
        </button>

        {health && (
          <div className="model-card">
            <div>
              <span className="eyebrow">{t('aiModel')}</span>
              <b>{health.model}</b>
            </div>
            <div>
              <span className="eyebrow">{t('runtime')}</span>
              <b>{health.runtime}</b>
            </div>
            <div>
              <span className="eyebrow">{t('device')}</span>
              <b>{health.device}</b>
            </div>
            <div className="model-card-wide">
              <span className="eyebrow">{t('detects')}</span>
              <b>{health.categories.map((c) => t(`cat_${c.key}`)).join(' · ')}</b>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

function Slider({ label, value, hint, min, max, step, current, onChange }) {
  const fill = ((current - min) / (max - min)) * 100
  return (
    <label className="field slider">
      <span className="slider-top">
        <span>{label}</span>
        <b>{value}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={current} onChange={onChange} style={{ '--fill': `${fill}%` }} />
      <small>{hint}</small>
    </label>
  )
}
