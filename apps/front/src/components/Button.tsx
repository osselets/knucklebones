import type * as React from 'react'
import { clsx } from 'clsx'
import { IconWrapper } from './IconWrapper'

export interface ButtonProps<E extends React.ElementType> {
  // Not a fan of having this prop
  center?: boolean
  size?: 'default' | 'large' | 'medium'
  variant?: 'primary' | 'secondary' | 'ghost'
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  as?: E
}
type PolymorphedButtonProps<E extends React.ElementType> = ButtonProps<E> &
  Omit<React.ComponentProps<E>, keyof ButtonProps<E>>

const defaultElement = 'button'

export function Button<E extends React.ElementType = typeof defaultElement>({
  children,
  leftIcon,
  rightIcon,
  center = true,
  size = 'default',
  variant = 'primary',
  as,
  ...props
}: PolymorphedButtonProps<E>) {
  const Component = as ?? defaultElement
  return (
    <Component
      {...props}
      className={clsx(
        'flex flex-row items-center gap-2 rounded-md text-center font-medium text-slate-900 transition-colors duration-100 disabled:opacity-50 dark:text-slate-50',
        {
          'justify-center': center,
          'justify-start': !center,
          'px-2 py-1 text-base md:p-2': size === 'default',
          'p-2 text-lg tracking-tight md:p-3 md:text-xl': size === 'medium',
          'p-2 text-2xl tracking-tight md:p-4 md:text-4xl': size === 'large',
          'bg-slate-200 hover:bg-slate-200/70 disabled:hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-700/70 disabled:dark:hover:bg-slate-700':
            variant === 'primary',
          'hover:bg-transparent/5 dark:hover:bg-transparent/20':
            variant !== 'primary',
          'border-2 border-slate-300 dark:border-slate-600': variant !== 'ghost'
        },
        props.className
      )}
    >
      {leftIcon !== undefined && <IconWrapper>{leftIcon}</IconWrapper>}
      <div className='translate-y-px'>{children}</div>
      {rightIcon !== undefined && <IconWrapper>{rightIcon}</IconWrapper>}
    </Component>
  )
}
