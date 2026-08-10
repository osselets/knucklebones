import type * as React from 'react'
import { clsx } from 'clsx'
import { IconWrapper } from './IconWrapper'

interface IconButtonProps<E extends React.ElementType> {
  icon: React.ReactNode
  as?: E
}
type PolymorphedIconButtonProps<E extends React.ElementType> =
  IconButtonProps<E> & Omit<React.ComponentProps<E>, keyof IconButtonProps<E>>

const defaultElement = 'button'

export function IconButton<
  E extends React.ElementType = typeof defaultElement
>({ icon, as, ...props }: PolymorphedIconButtonProps<E>) {
  const Component = as ?? defaultElement
  return (
    <Component
      {...props}
      className={clsx(
        'cursor-pointer text-slate-900 transition-all hover:text-slate-900/80 disabled:cursor-not-allowed dark:text-slate-200 dark:hover:text-slate-50/80',
        props.className
      )}
    >
      <IconWrapper>{icon}</IconWrapper>
    </Component>
  )
}
