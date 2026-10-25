import { useState } from 'react'
import { acceleratorFromEvent, formatAccelerator } from '@shared/accelerator'

interface Props {
  value: string
  platform: string
  recordLabel: string
  invalid: boolean
  onChange(value: string): void
}

export function HotkeyInput({ value, platform, recordLabel, invalid, onChange }: Props): React.JSX.Element {
  const [recording, setRecording] = useState(false)
  return (
    <button
      type="button"
      className={`hotkey${recording ? ' recording' : ''}${invalid ? ' invalid' : ''}`}
      onClick={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      onKeyDown={(event) => {
        if (!recording) return
        event.preventDefault()
        if (event.key === 'Escape') {
          setRecording(false)
          return
        }
        const accelerator = acceleratorFromEvent(event.nativeEvent)
        if (accelerator) {
          setRecording(false)
          onChange(accelerator)
        }
      }}
    >
      {recording ? recordLabel : formatAccelerator(value, platform)}
    </button>
  )
}
