import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { cn } from '../../lib/cn'

/**
 * Copied into the repository rather than imported, which is the whole point of
 * shadcn: the transport bar needs a button that is a 32px icon target with no
 * label, and editing this file is cheaper than fighting a package's API.
 *
 * Every colour is a token class. None is a literal.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-(--radius) text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-contrast hover:opacity-90',
        secondary: 'bg-surface-overlay text-text-default hover:bg-surface-raised',
        outline:
          'border border-border-subtle bg-transparent text-text-default hover:bg-surface-overlay hover:text-text-strong',
        ghost: 'bg-transparent text-text-muted hover:bg-surface-overlay hover:text-text-strong',
        danger: 'bg-danger text-accent-contrast hover:opacity-90',
      },
      size: {
        sm: 'h-8 px-3',
        md: 'h-9 px-4',
        lg: 'h-10 px-6',
        icon: 'size-9 p-0',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
    },
  },
)

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element instead of a button, keeping the styling. */
    readonly asChild?: boolean
  }

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button'
  return <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

export { buttonVariants }
