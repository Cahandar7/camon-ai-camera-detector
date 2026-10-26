import { useCallback, useEffect, useRef, useState } from 'react'
import AlarmOverlay from './components/AlarmOverlay'
import AlertsFeed from './components/AlertsFeed'
import CameraModal from './components/CameraModal'
import ConfirmModal from './components/ConfirmModal'
import EmptyState from './components/EmptyState'
import Header from './components/Header'
import HistoryChart from './components/HistoryChart'
import Insights from './components/Insights'
import Lightbox from './components/Lightbox'
import LitterList from './components/LitterList'
import LiveView from './components/LiveView'
import ChangePasswordModal from './components/ChangePasswordModal'
import LoginPage from './components/LoginPage'
import Overview from './components/Overview'
import ResetPasswordPage from './components/ResetPasswordPage'
import SettingsModal from './components/SettingsModal'
import Sidebar from './components/Sidebar'
import Toasts from './components/Toasts'
import { useCameraFeed } from './hooks/useCameraFeed'
import { useEvents } from './hooks/useEvents'
import { useStoredState } from './hooks/useStoredState'
import { useI18n } from './i18n/core'
import { UNAUTHORIZED, api } from './lib/api'
import { playAlert, unlockAudio } from './lib/sound'

const ALARM_MS = { critical: 9000, warning: 1600 }

/** Login gate: the dashboard (and its sockets) only exist for a signed-in user.
 * A password-reset link (/?reset=<token>) opens the reset page instead. */
export default function App() {
  const [user, setUser] = useState(undefined) // undefined = checking the session
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(location.search).get('reset'))
  const [loginMode, setLoginMode] = useState('login')

  useEffect(() => {
    api.me().then(setUser, () => setUser(null))
    const signedOut = () => setUser(null)
    window.addEventListener(UNAUTHORIZED, signedOut)
    return () => window.removeEventListener(UNAUTHORIZED, signedOut)
  }, [])

  if (resetToken) {
    return (
      <ResetPasswordPage
        token={resetToken}
        onDone={(mode) => {
          history.replaceState(null, '', '/') // the token is single-use; drop it from the address bar
          setResetToken(null)
          setLoginMode(mode)
          setUser(null) // a reset signs the account out everywhere
        }}
      />
    )
  }
  if (user === undefined) {
    return (
      <main className="splash">
        <div className="spinner" />
      </main>
    )
  }
  if (!user) return <LoginPage key={loginMode} initialMode={loginMode} onLogin={setUser} />
  return (
    <Dashboard
      user={user}
      onLogout={async () => {
        await api.logout().catch(() => {})
        setUser(null)
      }}
    />
  )
}

function Dashboard({ user, onLogout }) {
  const { t } = useI18n()
  const [health, setHealth] = useState(null)
  const [cameras, setCameras] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [settings, setSettings] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [toasts, setToasts] = useState([])
  const [alarm, setAlarm] = useState(null)
  const [modal, setModal] = useState(null)
  const [snapshot, setSnapshot] = useState(null)
  const [selectedId, setSelectedId] = useStoredState('camon.camera', null)
  const [view, setView] = useStoredState('camon.view', 'live')
  const [sound, setSound] = useStoredState('camon.sound', true)
  const soundRef = useRef(sound)
  useEffect(() => {
    soundRef.current = sound
  }, [sound])

  // After a page reload audio is locked again until the first click or key press
  useEffect(() => {
    const unlock = () => unlockAudio()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  const loadAll = useCallback(async () => {
    api.health().then(setHealth).catch(() => {})
    api.settings().then(setSettings).catch(() => {})
    api.alerts().then(setAlerts).catch(() => {})
    try {
      setCameras(await api.cameras())
    } finally {
      setLoaded(true)
    }
  }, [])

  const dismissToast = useCallback((id) => setToasts((list) => list.filter((a) => a.id !== id)), [])

  const raiseAlarm = useCallback((alert, { force = false } = {}) => {
    if (soundRef.current || force) {
      playAlert(alert.severity, { force, lang: t.lang })
    }
    const duration = ALARM_MS[alert.severity]
    if (!duration) return
    const key = Date.now()
    setAlarm({ ...alert, key })
    setTimeout(() => setAlarm((current) => (current?.key === key ? null : current)), duration)
  }, [t])

  const onAlert = useCallback(
    (alert) => {
      setAlerts((list) => [alert, ...list].slice(0, 200))
      setToasts((list) => [alert, ...list].slice(0, 3))
      setTimeout(() => dismissToast(alert.id), 7000)
      raiseAlarm(alert)
    },
    [dismissToast, raiseAlarm],
  )

  const { summaries, connected } = useEvents(onAlert)

  // (Re)load everything whenever the backend connection comes up — covers restarts
  useEffect(() => {
    if (connected) loadAll().catch(() => {})
  }, [connected, loadAll])

  useEffect(() => {
    loadAll().catch(() => {})
  }, [loadAll])

  const live = cameras.map((c) => ({ ...c, ...summaries[c.id] }))
  const current = live.find((c) => c.id === selectedId) ?? live[0]

  const openCamera = (id) => {
    setSelectedId(id)
    setView('live')
  }

  const saveCamera = async (data) => {
    if (modal.camera) {
      await api.updateCamera(modal.camera.id, data)
    } else {
      const cam = await api.addCamera(data)
      openCamera(cam.id)
    }
    setCameras(await api.cameras())
    setModal(null)
  }

  const deleteCamera = async (cam) => {
    await api.deleteCamera(cam.id)
    setCameras(await api.cameras())
  }

  const clearAlerts = async () => {
    await api.clearAlerts()
    setAlerts([])
  }

  const testAlarm = () => {
    setModal(null)
    raiseAlarm(
      {
        severity: 'critical',
        camera_id: current?.id,
        camera_name: current?.name ?? 'CamOn',
        zone: current?.zone ?? '',
        score: 34,
      },
      { force: true },
    )
  }

  let content
  if (!loaded) {
    content = (
      <main className="splash">
        <div className="spinner" />
      </main>
    )
  } else if (!cameras.length) {
    content = <EmptyState onAdd={() => setModal({ type: 'camera' })} />
  } else if (view === 'overview') {
    content = <Overview cameras={live} onOpen={openCamera} onAdd={() => setModal({ type: 'camera' })} />
  } else {
    content = (
      <main className="layout">
        <Sidebar
          cameras={live}
          selectedId={current.id}
          onSelect={setSelectedId}
          onAdd={() => setModal({ type: 'camera' })}
        />
        <Monitor
          key={`${current.id}:${current.url}`}
          camera={current}
          health={health}
          settings={settings}
          alerts={alerts}
          onEdit={() => setModal({ type: 'camera', camera: current })}
          onDelete={() => setModal({ type: 'delete', camera: current })}
          onOpenSnapshot={setSnapshot}
          onSelectCamera={openCamera}
          onClearAlerts={clearAlerts}
        />
      </main>
    )
  }

  return (
    <div className="app">
      <Header
        view={view}
        onView={setView}
        health={health}
        connected={connected}
        sound={sound}
        onToggleSound={() => setSound((s) => !s)}
        onSettings={() => setModal({ type: 'settings' })}
        showNav={cameras.length > 0}
        user={user}
        onLogout={onLogout}
        onChangePassword={() => setModal({ type: 'password' })}
      />
      {content}

      {modal?.type === 'camera' && (
        <CameraModal camera={modal.camera} count={cameras.length} onSave={saveCamera} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'settings' && settings && (
        <SettingsModal
          settings={settings}
          health={health}
          onSave={async (form) => setSettings(await api.saveSettings(form))}
          onClearAlerts={clearAlerts}
          onTestAlarm={testAlarm}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'delete' && (
        <ConfirmModal
          title={t('confirmRemoveTitle')}
          text={t('confirmRemoveText', { name: modal.camera.name })}
          confirmLabel={t('removeBtn')}
          onConfirm={() => deleteCamera(modal.camera)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'password' && <ChangePasswordModal onClose={() => setModal(null)} />}
      {snapshot && <Lightbox alert={snapshot} onClose={() => setSnapshot(null)} />}
      <AlarmOverlay
        alarm={alarm}
        onOpen={() => {
          openCamera(alarm.camera_id)
          setAlarm(null)
        }}
        onClose={() => setAlarm(null)}
      />
      <Toasts
        toasts={toasts}
        onOpen={(a) => {
          openCamera(a.camera_id)
          dismissToast(a.id)
        }}
        onDismiss={dismissToast}
      />
    </div>
  )
}

/** One camera: live video + overlay, history, litter list and the insights column. */
function Monitor({ camera, health, settings, alerts, onEdit, onDelete, onOpenSnapshot, onSelectCamera, onClearAlerts }) {
  const overlayRef = useRef(null)
  const feed = useCameraFeed(camera.id, (dets, resolution) => overlayRef.current?.update(dets, resolution))

  return (
    <>
      <section className="center">
        <LiveView camera={camera} feed={feed} health={health} overlayRef={overlayRef} onEdit={onEdit} onDelete={onDelete} />
        <div className="below">
          <HistoryChart history={feed.history} threshold={settings?.alert_threshold ?? 60} />
          <LitterList
            items={feed.status === 'online' ? feed.stats?.items : []}
            detections={feed.detections}
            dwellLimit={settings?.dwell_alert_seconds ?? 30}
          />
        </div>
      </section>
      <aside className="insights">
        <Insights feed={feed} health={health} settings={settings} />
        <AlertsFeed
          alerts={alerts}
          currentId={camera.id}
          onOpenSnapshot={onOpenSnapshot}
          onSelectCamera={onSelectCamera}
          onClear={onClearAlerts}
        />
      </aside>
    </>
  )
}
