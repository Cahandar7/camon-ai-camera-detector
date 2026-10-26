import Icon from './Icon'

/** A titled card on the account page. tone="danger" marks destructive actions. */
export default function Section({ icon, title, sub, tone, className = '', children }) {
  return (
    <section className={`panel acct-card ${tone ? `is-${tone}` : ''} ${className}`}>
      <header className="acct-card-head">
        <span className="acct-card-icon">
          <Icon name={icon} size={18} />
        </span>
        <div>
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
      </header>
      {children}
    </section>
  )
}

/** Success or error line under a form. */
export function FormStatus({ status }) {
  if (status.error) {
    return (
      <div className="form-error" role="alert">
        {status.error}
      </div>
    )
  }
  if (status.done) {
    return (
      <div className="form-ok" role="status">
        <Icon name="check" size={16} /> {status.done}
      </div>
    )
  }
  return null
}
