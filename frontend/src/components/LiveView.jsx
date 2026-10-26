import { useEffect, useRef, useState } from 'react'
import { useStoredState } from '../hooks/useStoredState'
import { useI18n } from '../i18n/core'
import { streamUrl } from '../lib/api'
import { HELD_COLOR, PERSON_COLOR, STATUS_CLASS, categoryColor } from '../lib/constants'
import { Overlay } from '../lib/overlay'
import Icon from './Icon'

export default function LiveView({ camera, feed, health, overlayRef, onEdit, onDelete }) {
  const { t } = useI18n()
  const imgRef = useRef(null)
  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const [opts, setOpts] = useStoredState('camon.overlay', { people: true, litter: true, labels: true })
  const [streamKey, setStreamKey] = useState(0)
  const online = feed.status === 'online'
  const level = online ? feed.stats?.level : null

  useEffect(() => {
    const overlay = new Overlay(canvasRef.current, imgRef.current)
    overlayRef.current = overlay
    return () => {
      overlay.destroy()
      overlayRef.current = null
    }
  }, [overlayRef])

  useEffect(() => {
    overlayRef.current?.setOptions(opts)
  }, [opts, overlayRef])

  useEffect(() => {
    overlayRef.current?.setLabels({ category: (key) => t(`cat_${key}`), carried: t('carriedShort') })
  }, [t, overlayRef])

  // Re-open the MJPEG connection when the camera comes back after a drop
  const wasOnline = useRef(online)
  useEffect(() => {
    if (online && !wasOnline.current) setStreamKey((k) => k + 1)
    wasOnline.current = online
  }, [online])

  const toggle = (key) => setOpts((o) => ({ ...o, [key]: !o[key] }))
  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else stageRef.current?.requestFullscreen?.()
  }
  const litter = feed.stats?.litter ?? 0
  const legend = (health?.categories ?? []).filter((c) => c.kind === 'litter')

  return (
    <div className="live">
      <div className="live-head">
        <div className="live-title">
          <h1>{camera.name}</h1>
          <span className="live-zone">
            <Icon name="pin" size={14} />
            {camera.zone || t('noZone')}
          </span>
          <span className={`status-pill ${STATUS_CLASS[feed.status] ?? ''}`}>
            <span className="status-dot" />
            {t(`status_${feed.status}`)}
          </span>
        </div>
        <div className="live-actions">
          <button className="icon-btn" onClick={onEdit} title={t('editCamera')}>
            <Icon name="edit" />
          </button>
          <button className="icon-btn danger" onClick={onDelete} title={t('removeCamera')}>
            <Icon name="trash" />
          </button>
        </div>
      </div>

      <div ref={stageRef} className={`stage ${level ? `level-${level}` : ''}`}>
        <img
          ref={imgRef}
          className="stage-video"
          src={streamUrl(camera.id, streamKey)}
          alt=""
          onError={() => setTimeout(() => setStreamKey((k) => k + 1), 1500)}
        />
        <canvas ref={canvasRef} className="stage-overlay" />

        <div className="hud hud-tl">
          <span className={`live-pill ${online ? '' : 'is-off'}`}>
            <span className="rec-dot" />
            {online ? t('live') : t('noSignal')}
          </span>
          {(level === 'dirty' || level === 'critical') && (
            <span className={`hud-pill alert-pill ${level}`}>
              <Icon name="alert" size={14} />
              {level === 'critical' ? t('criticalSend') : t('zoneNeedsCleaning')} · {t('items', { n: litter })}
            </span>
          )}
        </div>

        {online && feed.fps && (
          <div className="hud hud-tr">
            <span className="hud-pill" title={t('fpsCameraTitle')}>
              <Icon name="camera" size={13} /> {Math.round(feed.fps.camera)} FPS
            </span>
            <span className="hud-pill hud-ai" title={t('fpsAiTitle')}>
              <Icon name="sparkles" size={13} /> AI {Math.round(feed.fps.ai)} FPS · {Math.round(feed.latency ?? 0)} ms
            </span>
          </div>
        )}

        {online && (
          <div className="hud hud-bl">
            {feed.resolution && (
              <span className="hud-pill mono">
                {feed.resolution[0]}×{feed.resolution[1]}
              </span>
            )}
            {health && <span className="hud-pill">{health.model}</span>}
          </div>
        )}

        <div className="hud hud-br">
          <button className={`hud-btn ${opts.people ? 'is-on' : ''}`} onClick={() => toggle('people')} title={t('showPeople')}>
            <Icon name="user" size={15} />
          </button>
          <button className={`hud-btn ${opts.litter ? 'is-on' : ''}`} onClick={() => toggle('litter')} title={t('showLitter')}>
            <Icon name="bottle" size={15} />
          </button>
          <button className={`hud-btn ${opts.labels ? 'is-on' : ''}`} onClick={() => toggle('labels')} title={t('showLabels')}>
            <Icon name="tag" size={15} />
          </button>
          <button className="hud-btn" onClick={fullscreen} title={t('fullscreen')}>
            <Icon name="maximize" size={15} />
          </button>
        </div>

        {!online && (
          <div className="stage-placeholder">
            {feed.status === 'offline' ? (
              <>
                <div className="placeholder-icon">
                  <Icon name="wifiOff" size={28} />
                </div>
                <h3>{t('offlineTitle')}</h3>
                <p>{t('offlineText')}</p>
                {feed.error && <code className="placeholder-error">{feed.error}</code>}
              </>
            ) : (
              <>
                <div className="spinner" />
                <h3>{t('connectingCamera')}</h3>
                <p className="mono">{camera.url}</p>
              </>
            )}
          </div>
        )}
      </div>

      <div className="legend">
        <span className="legend-item">
          <i style={{ background: PERSON_COLOR }} /> {t('cat_person')}
        </span>
        {legend.map((c) => (
          <span key={c.key} className="legend-item">
            <i style={{ background: categoryColor(c.key) }} /> {t(`cat_${c.key}`)}
          </span>
        ))}
        <span className="legend-item">
          <i className="dashed" /> {t('verifying')}
        </span>
        <span className="legend-item">
          <i style={{ background: HELD_COLOR }} /> {t('carried')}
        </span>
      </div>
    </div>
  )
}
