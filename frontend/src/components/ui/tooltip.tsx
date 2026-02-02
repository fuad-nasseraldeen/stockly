import * as React from "react"
import { createPortal } from "react-dom"
import { Info } from "lucide-react"
import { cn } from "@/lib/utils"

interface TooltipProps {
  content: string | React.ReactNode
  children?: React.ReactNode
  className?: string
}

export function Tooltip({ content, children, className }: TooltipProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [position, setPosition] = React.useState({ top: 0, left: 0 })
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const tooltipRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        buttonRef.current && 
        !buttonRef.current.contains(event.target as Node) &&
        tooltipRef.current &&
        !tooltipRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
      // Calculate position when opening
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect()
        setPosition({
          top: rect.top - 10, // Position above the button
          left: rect.left + rect.width / 2, // Center horizontally
        })
      }
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isOpen])

  return (
    <>
      <div className="inline-flex items-center gap-1 relative">
        {children}
        <button
          ref={buttonRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setIsOpen(!isOpen)
          }}
          className={cn(
            "inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
            "cursor-help",
            className
          )}
          aria-label="מידע נוסף"
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </div>
      {isOpen && typeof window !== 'undefined' && createPortal(
        <>
          <div
            className="fixed inset-0 z-[9998] bg-black/20"
            onClick={() => setIsOpen(false)}
          />
          <div
            ref={tooltipRef}
            className={cn(
              "fixed z-[9999] p-3 bg-popover text-popover-foreground rounded-lg shadow-2xl border-2 border-border",
              "max-w-xs text-sm leading-relaxed",
              "pointer-events-auto"
            )}
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
              transform: 'translate(-50%, -100%)',
              marginBottom: '8px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative">
              {typeof content === "string" ? <p className="m-0 pr-5">{content}</p> : content}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsOpen(false)
                }}
                className="absolute -top-2 -right-2 rounded-full bg-muted hover:bg-muted/80 p-1 w-5 h-5 flex items-center justify-center text-xs font-bold border border-border shadow-sm"
                aria-label="סגור"
              >
                ×
              </button>
            </div>
            <div
              className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-popover border-r border-b border-border rotate-45"
            />
          </div>
        </>,
        document.body
      )}
    </>
  )
}
