import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/core'
import { clock } from '../lib/format'
import Icon from './Icon'
import Section, { FormStatus } from './Section'

export default function SettingsTab({ settings, sound, onSound, onSave, onTestAlarm }) {
  return (
    <div className="acct-grid settings-grid">
      {settings ? (
        <DetectionForm settings={settings} onSave={onSave} />
      ) : (
        <section className="panel acct-card acct-loading">
          <div className="spinner" />
        </section>
      )}
      <SoundCard sound={sound} onSound={onSound} onTestAlarm={onTestAlarm} />
    </div>
  )
}

function DetectionForm({ settings, onSave }) {
  const { t } = useI18n()
  const [form, setForm] = useState(settings)
  const [status, setStatus] = useState({})
  const dirty = Object.keys(form).some((key) => form[key] !== settings[key])
  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: Number(e.target.value) }))
    setStatus({})
  }

  useEffect(() => {
    if (!status.done) return undefined
    const timer = setTimeout(() => setStatus({}), 3000)
    return () => clearTimeout(timer)
  }, [status.done])

  const save = async (e) => {
    e.preventDefault()
    setStatus({ busy: true })
    try {
      setForm(await onSave(form))
      setStatus({ done: t('settingsSaved') })
    } catch (err) {
      setStatus({ error: err.message })
    }
  }

  return (
    <Section icon="sliders" title={t('detectionTitle')} sub={t('settingsSub')}>
      <form className="form" onSubmit={save}>
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
        <FormStatus status={status} />
        <div className="acct-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setForm(settings)} disabled={!dirty || status.busy}>
            {t('undoChanges')}
          </button>
          <button className="btn btn-primary" disabled={!dirty || status.busy}>
            {status.busy && <span className="spinner sm dark" />}
            {t('save')}
          </button>
        </div>
      </form>
    </Section>
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

function SoundCard({ sound, onSound, onTestAlarm }) {
  const { t } = useI18n()
  return (
    <Section icon={sound ? 'volume' : 'volumeOff'} title={t('soundTitle')} sub={t('soundSub')}>
      <label className="switch-row">
        <span className="switch-text">
          <b>{t('alertSounds')}</b>
          <small>{t('alertSoundsHint')}</small>
        </span>
        <input type="checkbox" role="switch" className="switch" checked={sound} onChange={(e) => onSound(e.target.checked)} />
      </label>
      <div className="acct-actions">
        <button type="button" className="btn btn-ghost" onClick={onTestAlarm}>
          <Icon name="zap" size={16} /> {t('testAlarm')}
        </button>
      </div>
    </Section>
  )
}

