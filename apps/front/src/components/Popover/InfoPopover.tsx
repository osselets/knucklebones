import type * as React from 'react'
import { QuestionMarkCircleIcon } from '@heroicons/react/24/outline'
import { IconWrapper } from '../IconWrapper'
import { Popover, PopoverContent, PopoverTrigger } from '.'

export function InfoPopover({ children }: React.PropsWithChildren) {
  return (
    <Popover>
      <PopoverTrigger>
        <IconWrapper>
          <QuestionMarkCircleIcon />
        </IconWrapper>
      </PopoverTrigger>
      <PopoverContent className='whitespace-pre-line'>
        {children}
      </PopoverContent>
    </Popover>
  )
}
