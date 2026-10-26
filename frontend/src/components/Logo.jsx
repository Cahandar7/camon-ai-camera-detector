/** One camera outline with the neural network directly inside it. */
export default function Logo({ size = 36, showText = true, animated = false }) {
  return (
    <span className={`logo ${animated ? 'is-animated' : ''}`}>
      <img className="logo-mark" src="/favicon.svg?v=mesh-2" width={size} height={size} alt="" />
      {showText && (
        <span className="logo-text">
          Cam<span>On</span>
        </span>
      )}
    </span>
  )
}
