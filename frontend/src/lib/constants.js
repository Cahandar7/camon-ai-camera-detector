// Colours only — the names shown to people come from the i18n dictionaries
// (keys cat_<category>, level_<level>, hint_<level>, status_<status>).

export const PERSON_COLOR = '#4cc9f0'
export const HELD_COLOR = '#9aa4b5'

// Keys match backend/app/detector.py CATEGORIES
const CATEGORY_COLOR = {
  person: PERSON_COLOR,
  bottle: '#ff8a3d',
  cup: '#ffc247',
  can: '#ff5d73',
  bag: '#b48cff',
  paper: '#f2e15b',
  food: '#a3e635',
}

export const categoryColor = (key) => CATEGORY_COLOR[key] ?? '#ff8a3d'

const LEVEL_COLOR = {
  clean: 'var(--ok)',
  moderate: 'var(--accent-2)',
  dirty: 'var(--warn)',
  critical: 'var(--danger)',
}

export const levelColor = (key) => LEVEL_COLOR[key] ?? 'var(--muted)'

export const STATUS_CLASS = {
  online: 'is-online',
  connecting: 'is-connecting',
  offline: 'is-offline',
  disabled: 'is-offline',
}
