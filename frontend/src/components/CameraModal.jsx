import { useRef, useState } from 'react'
import { useI18n } from '../i18n/core'
import { api, uploadVideo } from '../lib/api'
import Icon from './Icon'
import Modal from './Modal'

const SOURCES = [
  { key: 'ipwebcam', icon: 'phone', placeholder: '192.168.1.25:8080' },
  { key: 'rtsp', icon: 'cctv', placeholder: 'rtsp://user:pass@192.168.1.64:554/stream1' },
  { key: 'file', icon: 'film' },
]

function detectSource(url) {
  if (!url) return 'ipwebcam'
  if (/^https?:/i.test(url) || /^[\w.-]+:\d+/.test(url)) return 'ipwebcam'
  if (url.startsWith('/') || /^[a-z]:\\/i.test(url)) return 'file'
  return 'rtsp' // rtsp:// and any other stream URL
}

function toUrl(source, value) {
  const v = value.trim()
  return source === 'ipwebcam' && v && !/^https?:\/\//i.test(v) ? `http://${v}` : v
}

function toValue(source, url) {
  if (source !== 'ipwebcam') return url
  return url.replace(/^http:\/\//i, '').replace(/\/video$/, '')
}

// Uploaded files are stored as "<8 hex>_<original name>"
const fileLabel = (path) => path.split(/[\\/]/).pop().replace(/^[0-9a-f]{8}_/, '')

export default function CameraModal({ camera, count, onSave, onClose }) {
  const { t } = useI18n()
  const defaultName = t('defaultCameraName', { n: count + 1 })
  const initialSource = detectSource(camera?.url)
  const [name, setName] = useState(camera?.name ?? defaultName)
  const [zone, setZone] = useState(camera?.zone ?? '')
  const [source, setSource] = useState(initialSource)
  const [value, setValue] = useState(camera ? toValue(initialSource, camera.url) : '')
  const [test, setTest] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const uploaded = useRef(null) // a video uploaded in this dialog and not saved yet
  const spec = SOURCES.find((s) => s.key === source)

  const runTest = async (url = toUrl(source, value)) => {
    setTest({ loading: true })
    try {
      setTest(await api.testCamera(url))
    } catch (e) {
      setTest({ ok: false, error: e.message })
    }
  }

  const discardUpload = () => {
    if (uploaded.current) api.discardVideo(uploaded.current).catch(() => {})
    uploaded.current = null
  }

  const onUploaded = (res) => {
    discardUpload()
    uploaded.current = res.path
    setValue(res.path)
    if (name === defaultName) setName(res.name.replace(/\.[^.]+$/, '').slice(0, 60))
    runTest(res.path)
  }

  const close = () => {
    discardUpload()
    onClose()
  }

  const save = async (e) => {
    e?.preventDefault()
    if (!name.trim() || !value.trim()) {
      setError(t('required'))
      return
    }
    setSaving(true)
    setError('')
    try {
      const url = toUrl(source, value)
      if (uploaded.current !== url) discardUpload()
      uploaded.current = null
      await onSave({ name: name.trim(), zone: zone.trim(), url, enabled: true })
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal
      title={camera ? t('editCameraTitle') : t('addCameraTitle')}
      subtitle={t('cameraModalSub')}
      onClose={close}
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => runTest()} disabled={!value.trim() || test?.loading}>
            <Icon name="refresh" size={16} /> {t('testConnection')}
          </button>
          <span className="spacer" />
          <button className="btn btn-ghost" onClick={close}>
            {t('cancel')}
          </button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? t('saving') : camera ? t('saveChanges') : t('addCamera')}
          </button>
        </>
      }
    >
      <form className="form" onSubmit={save}>
        <div className="form-row">
          <label className="field">
            <span>{t('cameraName')}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('cameraNamePh')} maxLength={60} autoFocus />
          </label>
          <label className="field">
            <span>{t('zone')}</span>
            <input value={zone} onChange={(e) => setZone(e.target.value)} placeholder={t('zonePh')} maxLength={60} />
          </label>
        </div>

        <div className="field">
          <span>{t('videoSource')}</span>
          <div className="segmented">
            {SOURCES.map((s) => (
              <button
                type="button"
                key={s.key}
                className={s.key === source ? 'is-active' : ''}
                onClick={() => {
                  if (s.key === source) return
                  setSource(s.key)
                  setValue(s.key === initialSource && camera ? toValue(s.key, camera.url) : '')
                  setTest(null)
                }}
              >
                <Icon name={s.icon} size={16} />
                {t(`src_${s.key}`)}
              </button>
            ))}
          </div>
        </div>

        {source === 'file' ? (
          <div className="field">
            <span>{t('srcField_file')}</span>
            <VideoDrop current={value ? fileLabel(value) : ''} onUploaded={onUploaded} />
            <small>{t('srcHint_file')}</small>
          </div>
        ) : (
          <label className="field">
            <span>{t(`srcField_${source}`)}</span>
            <input
              className="mono"
              value={value}
              onChange={(e) => {
                setValue(e.target.value)
                setTest(null)
              }}
              placeholder={spec.placeholder}
              spellCheck={false}
            />
            <small>{t(`srcHint_${source}`)}</small>
          </label>
        )}

        {test && (
          <div className={`test-result ${test.loading ? '' : test.ok ? 'is-ok' : 'is-fail'}`}>
            {test.loading ? (
              <>
                <div className="spinner sm" /> {t('connecting')}
              </>
            ) : test.ok ? (
              <>
                <img src={test.preview} alt={t('previewAlt')} />
                <div>
                  <b>
                    <Icon name="check" size={16} /> {t('connected')}
                  </b>
                  <span className="mono">
                    {test.width}×{test.height} · {source === 'file' ? fileLabel(test.url) : test.url}
                  </span>
                </div>
              </>
            ) : (
              <div>
                <b>
                  <Icon name="alert" size={16} /> {t('cantReach')}
                </b>
                <span className="mono">{test.error}</span>
              </div>
            )}
          </div>
        )}
        {error && <div className="form-error">{error}</div>}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

/** Drop zone / file picker that uploads a demo video to the server with progress. */
function VideoDrop({ current, onUploaded }) {
  const { t } = useI18n()
  const inputRef = useRef(null)
  const [drag, setDrag] = useState(false)
  const [progress, setProgress] = useState(null) // 0..1 while uploading
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')

  const start = async (f) => {
    if (!f || progress != null) return
    setFile(f)
    setError('')
    setProgress(0)
    try {
      onUploaded(await uploadVideo(f, setProgress))
    } catch (e) {
      setError(e.message)
    } finally {
      setProgress(null)
    }
  }

  const uploading = progress != null
  return (
    <div
      className={`dropzone ${drag ? 'is-drag' : ''} ${uploading ? 'is-busy' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => !uploading && inputRef.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !uploading && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setDrag(true)
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDrag(false)
        start(e.dataTransfer.files[0])
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*,.mkv"
        hidden
        onChange={(e) => {
          start(e.target.files[0])
          e.target.value = ''
        }}
      />
      {uploading ? (
        <div className="drop-busy">
          <span className="drop-file">
            <Icon name="film" size={18} /> {file.name}
          </span>
          <span className="drop-bar">
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
          <span className="drop-note">{t('uploading', { pct: t.pct(Math.round(progress * 100)) })}</span>
        </div>
      ) : current ? (
        <div className="drop-current">
          <span className="drop-file">
            <Icon name="film" size={18} /> {current}
          </span>
          <span className="drop-link">{t('chooseAnother')}</span>
        </div>
      ) : (
        <div className="drop-empty">
          <span className="drop-icon">
            <Icon name="upload" size={22} />
          </span>
          <b>{t('uploadDrop')}</b>
          <span className="drop-note">{t('uploadFormats')}</span>
        </div>
      )}
      {error && (
        <span className="drop-error">
          {t('uploadFailed')}: {error}
        </span>
      )}
    </div>
  )
}
