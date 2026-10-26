import { alertText, useI18n } from '../i18n/core'
import Modal from './Modal'

export default function Lightbox({ alert, onClose }) {
  const { t } = useI18n()
  const { title, message } = alertText(alert, t)
  return (
    <Modal
      title={title}
      subtitle={`${alert.camera_name}${alert.zone ? ` · ${alert.zone}` : ''} · ${t.time(new Date(alert.ts * 1000))}`}
      onClose={onClose}
      wide
    >
      <img className="lightbox-img" src={alert.snapshot} alt="" />
      <p className="lightbox-msg">{message}</p>
    </Modal>
  )
}
