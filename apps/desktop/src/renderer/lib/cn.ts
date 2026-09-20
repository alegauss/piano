import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge class names, with later Tailwind utilities winning over earlier ones.
 *
 * The shadcn convention: clsx resolves the conditionals and tailwind-merge
 * resolves the conflicts, so a caller can pass `px-2` to a component that
 * already sets `px-4` and get what they asked for rather than whichever the
 * stylesheet happened to order last.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
