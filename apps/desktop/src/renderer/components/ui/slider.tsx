import * as SliderPrimitive from '@radix-ui/react-slider'
import type { ComponentProps } from 'react'

import { cn } from '../../lib/cn'

/**
 * The scrubber over the whole piece, and the level controls beside it.
 *
 * Kept as a plain slider here. PI30 needs it to behave as a transport
 * scrubber, where dragging must not fight the position arriving from the audio
 * clock, and that is an edit to this file rather than a wrapper around it.
 */
export function Slider({ className, ...props }: ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      className={cn('relative flex w-full touch-none select-none items-center', className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-surface-overlay">
        <SliderPrimitive.Range className="absolute h-full bg-accent" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className={cn(
          'block size-3.5 rounded-full border-2 border-accent bg-surface-raised transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          'disabled:pointer-events-none disabled:opacity-50',
        )}
      />
    </SliderPrimitive.Root>
  )
}
