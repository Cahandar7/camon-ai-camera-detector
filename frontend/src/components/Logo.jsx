import { useId } from 'react'

/**
 * CamOn mark: viewfinder brackets (the same corners the AI draws around litter),
 * a camera lens inside them and an AI spark. `animated` adds a scanning beam.
 */
export default function Logo({ size = 34, showText = true, animated = false }) {
  const id = useId().replace(/:/g, '')
  const stroke = `url(#${id}-g)`
  return (
    <span className={`logo ${animated ? 'is-animated' : ''}`}>
      <svg className="logo-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-g`} x1="6" y1="6" x2="58" y2="58" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#5CF6BE" />
            <stop offset="0.55" stopColor="#1FD1B2" />
            <stop offset="1" stopColor="#3BB8F5" />
          </linearGradient>
          <radialGradient id={`${id}-i`} cx="0.42" cy="0.4" r="0.65">
            <stop offset="0" stopColor="#8BFAD2" />
            <stop offset="1" stopColor="#14B8A6" />
          </radialGradient>
        </defs>
        <rect x="1" y="1" width="62" height="62" rx="17" fill="#0C141C" stroke={stroke} strokeOpacity="0.4" strokeWidth="1.5" />
        <path
          d="M11 21v-6a4 4 0 0 1 4-4h6M43 11h6a4 4 0 0 1 4 4v6M53 43v6a4 4 0 0 1-4 4h-6M21 53h-6a4 4 0 0 1-4-4v-6"
          fill="none"
          stroke={stroke}
          strokeWidth="3.6"
          strokeLinecap="round"
        />
        <circle cx="32" cy="33" r="11" fill="none" stroke={stroke} strokeWidth="3.4" />
        <circle className="logo-iris" cx="32" cy="33" r="5" fill={`url(#${id}-i)`} />
        <circle cx="29.7" cy="30.7" r="1.4" fill="#fff" opacity="0.9" />
        <path
          className="logo-spark"
          d="M44.5 14.2l1.6 3.7 3.7 1.6-3.7 1.6-1.6 3.7-1.6-3.7-3.7-1.6 3.7-1.6z"
          fill="#fff"
        />
        {animated && <rect className="logo-scan" x="14" y="14" width="36" height="2" rx="1" fill={stroke} />}
      </svg>
      {showText && (
        <span className="logo-text">
          Cam<span>On</span>
        </span>
      )}
    </span>
  )
}
