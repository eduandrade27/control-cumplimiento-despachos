import { cloneElement, createElement, isValidElement, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { FocusEvent, KeyboardEvent, MouseEvent, PointerEvent as ReactPointerEvent, ReactElement, ReactNode, Ref, MutableRefObject } from 'react'
import { createPortal } from 'react-dom'

interface TooltipPosition {
  left: number
  top: number
}

interface TooltipProps {
  content: ReactNode
  children: ReactElement
  className?: string
  disabled?: boolean
}

function mergeRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (value: T | null) => {
    for (const ref of refs) {
      if (!ref) {
        continue
      }

      if (typeof ref === 'function') {
        ref(value)
        continue
      }

      ;(ref as MutableRefObject<T | null>).current = value
    }
  }
}

function isNaturallyFocusable(tagName: string): boolean {
  return ['button', 'a', 'input', 'select', 'textarea'].includes(tagName)
}

export function Tooltip({ content, children, className, disabled = false }: TooltipProps) {
  const triggerRef = useRef<HTMLElement | SVGElement | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState<TooltipPosition | null>(null)

  const updatePosition = useMemo(() => {
    return () => {
      const trigger = triggerRef.current
      const tooltip = tooltipRef.current
      if (!trigger || !tooltip) {
        return
      }

      const triggerRect = trigger.getBoundingClientRect()
      const tooltipRect = tooltip.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const gap = 10
      const viewportPadding = 12

      let left = triggerRect.left + (triggerRect.width / 2)
      left = Math.max(tooltipRect.width / 2 + viewportPadding, Math.min(viewportWidth - tooltipRect.width / 2 - viewportPadding, left))

      let top = triggerRect.top - gap
      if (top < viewportPadding) {
        top = triggerRect.bottom + gap
      } else if (top - tooltipRect.height < viewportPadding) {
        top = triggerRect.bottom + gap
      }

      if (top + tooltipRect.height > viewportHeight - viewportPadding) {
        top = Math.max(viewportPadding, triggerRect.top - gap)
      }

      setPosition({ left, top })
    }
  }, [])

  useLayoutEffect(() => {
    if (!isOpen) {
      return
    }

    updatePosition()
  }, [content, isOpen, updatePosition])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const closeTooltip = () => setIsOpen(false)

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Element | null
      if (target?.closest('[data-tooltip-trigger]') || target?.closest('[data-tooltip-content]')) {
        return
      }

      closeTooltip()
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('scroll', closeTooltip, true)
    window.addEventListener('resize', closeTooltip)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('scroll', closeTooltip, true)
      window.removeEventListener('resize', closeTooltip)
    }
  }, [isOpen])

  if (!isValidElement(children) || disabled) {
    return children
  }

  const childProps = children.props as Record<string, any>
  const childType = typeof children.type === 'string' ? children.type : ''
  const canReceiveFocus = isNaturallyFocusable(childType) || childProps.tabIndex !== undefined || childType === 'svg' || childType === 'rect' || childType === 'circle' || childType === 'article' || childType === 'span' || childType === 'div'

  const openTooltip = () => setIsOpen(true)
  const toggleTooltip = () => setIsOpen((current) => !current)

  return (
    <>
      {cloneElement(children as any, {
        ref: mergeRefs((children as { ref?: Ref<any> }).ref, triggerRef),
        'data-tooltip-trigger': 'true',
        tabIndex: canReceiveFocus ? (childProps.tabIndex ?? 0) : childProps.tabIndex,
        onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => {
          childProps.onPointerEnter?.(event)
          openTooltip()
        },
        onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => {
          childProps.onPointerLeave?.(event)
          setIsOpen(false)
        },
        onFocus: (event: FocusEvent<HTMLElement>) => {
          childProps.onFocus?.(event)
          openTooltip()
        },
        onBlur: (event: FocusEvent<HTMLElement>) => {
          childProps.onBlur?.(event)
          setIsOpen(false)
        },
        onClick: (event: MouseEvent<HTMLElement>) => {
          childProps.onClick?.(event)
          if (!event.defaultPrevented) {
            toggleTooltip()
          }
        },
        onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
          childProps.onKeyDown?.(event)
          if (event.key === 'Escape') {
            setIsOpen(false)
            return
          }

          if (event.key === 'Enter' || event.key === ' ') {
            openTooltip()
          }
        },
      })}

      {isOpen && typeof document !== 'undefined' && createPortal(
        createElement(
          'div',
          {
            ref: tooltipRef,
            className: `app-tooltip${className ? ` ${className}` : ''}`,
            role: 'tooltip',
            'data-tooltip-content': 'true',
            style: position ? { left: `${position.left}px`, top: `${position.top}px` } : undefined,
          },
          content,
        ),
        document.body,
      )}
    </>
  )
}