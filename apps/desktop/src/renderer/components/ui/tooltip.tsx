import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import {
  Children,
  isValidElement,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react'

import { cn } from '../../lib/cn'

/**
 * What a button would say if it could.
 *
 * The bar is a row of icons, each carrying an accessible name a screen reader
 * is given and a sighted reader never sees. These put that same name on screen
 * on hover and on focus, so the two halves of the interface say the same thing.
 */
export const TooltipProvider = TooltipPrimitive.Provider
export const Tooltip = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger

export function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 rounded-(--radius) border border-border-subtle bg-surface-overlay px-2 py-1 text-xs text-text-default shadow-lg',
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
}

/**
 * Short, but never nothing.
 *
 * A bar of icons whose tooltips all fire as the pointer crosses them is worse
 * than silence; one that makes somebody wait has not answered.
 */
export const HINT_DELAY_MS = 400

/**
 * The accessible name somewhere inside, which is the button's own.
 *
 * Searched rather than taken off the top, because half these buttons are
 * wrapped in a trigger that opens a panel and the name is a level down. One
 * string either way, and it stays where it is read from.
 */
function nameOf(node: ReactNode): string | undefined {
  if (!isValidElement<{ readonly 'aria-label'?: string; readonly children?: ReactNode }>(node)) {
    return undefined
  }
  const label = node.props['aria-label']
  if (typeof label === 'string' && label !== '') {
    return label
  }
  for (const child of Children.toArray(node.props.children)) {
    const found = nameOf(child)
    if (found !== undefined) {
      return found
    }
  }
  return undefined
}

/**
 * A button that says its own name on hover and on focus.
 *
 * The name is read off the child rather than passed in beside it. A tooltip
 * given its own copy of the text is a second thing to keep in step, and the
 * two drift the first time somebody rewords one: this way there is one string,
 * it lives on the button, and the screen reader and the pointer are told the
 * same thing by construction.
 *
 * A child with no accessible name is returned untouched, since a tooltip
 * repeating a name that is already visible is noise.
 */
export function Hint({ children }: { readonly children: ReactElement }) {
  const label = nameOf(Children.only(children))
  if (label === undefined) {
    return children
  }
  return (
    /*
      Its own provider, so a hint works wherever it is put: half these buttons
      live inside panels that are mounted on their own, and one provider around
      the bar would make each of those a runtime error rather than a tooltip.
      It costs the shared group — crossing the row, each icon waits its own
      delay instead of the rest opening at once — which is the behaviour worth
      having anyway: a row that speaks all at once as the pointer passes is the
      thing the delay exists to prevent.
    */
    <TooltipProvider delayDuration={HINT_DELAY_MS}>
      <Tooltip>
        {/*
          asChild all the way down, so the trigger is the button itself: a
          wrapper around it would take the pointer and the button would stop
          being clickable. Outside a panel's own trigger rather than inside it,
          which is the order that lets both compose onto one element.
        */}
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
