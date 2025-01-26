import * as React from 'react'
import { clsx } from 'clsx'
import * as PopoverPrimitive from '@radix-ui/react-popover'

const Popover = PopoverPrimitive.Root

const PopoverTrigger = PopoverPrimitive.Trigger

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
  // À investiguer pourquoi ça pop
  // eslint-disable-next-line react/prop-types
>(({ className, align = 'center', sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      // Reprendre les classes de shadcn pour les animations etc. au besoin
      className={clsx(
        'z-50 w-72 rounded-md border border-slate-300 bg-slate-50 p-4 text-slate-900 shadow-md outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-50',
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
))
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent }
