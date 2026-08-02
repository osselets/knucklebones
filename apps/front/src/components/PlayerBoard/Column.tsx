import type * as React from 'react'
import { clsx } from 'clsx'

interface ColumnProps {
  onClick?: React.MouseEventHandler<HTMLDivElement>
  readonly?: boolean
}

export function Column({
  children,
  onClick,
  readonly = false
}: React.PropsWithChildren<ColumnProps>) {
  return (
    <div
      className={clsx(
        'grid grid-rows-3 bg-slate-200 transition-all first:rounded-l-lg last:rounded-r-lg dark:bg-slate-700',
        {
          'cursor-pointer lg:hover:bg-slate-300 lg:dark:hover:bg-slate-800':
            onClick !== undefined && !readonly
        }
      )}
      role={onClick !== undefined && !readonly ? 'button' : undefined}
      onClick={onClick}
    >
      {children}
    </div>
  )
}
