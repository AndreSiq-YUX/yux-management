import { HelpCircle } from 'lucide-react'
import { useState } from 'react'

interface TooltipProps {
  content: string
  children?: React.ReactNode
}

export function Tooltip({ content, children }: TooltipProps) {
  const [show, setShow] = useState(false)

  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children || (
        <HelpCircle className="h-3.5 w-3.5 text-yx-fg-3 hover:text-yx-fg-2 cursor-help" />
      )}
      {show && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-ink-800 rounded whitespace-nowrap z-50 shadow-lg">
          {content}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-ink-800" />
        </span>
      )}
    </span>
  )
}
