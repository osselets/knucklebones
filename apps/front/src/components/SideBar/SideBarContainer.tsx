import * as React from 'react'
import { Link } from 'react-router-dom'
import { ChevronRightIcon } from '@heroicons/react/24/outline'
import { clsx } from 'clsx'
import { useDrag } from '@use-gesture/react'
import { useIsOnMobile } from '../../hooks/detectDevice'
import { useLocalizedPath } from '../../hooks/useLocalizedPath'
import KnucklebonesLogo from '../../svgs/logo.svg'
import { IconButton } from '../IconButton'
import { Text } from '../Text'
import { SideBarActionContainer } from './SideBarActions'

export interface SideBarContainerProps {
  actions: React.ReactNode
  swipeableAreaRef: React.RefObject<HTMLDivElement | null>
}

// https://ui.shadcn.com/docs/components/sheet ?
export function SideBarContainer({
  actions,
  swipeableAreaRef
}: SideBarContainerProps) {
  // Always displayed by default
  const [showToolbar, setShowToolbar] = React.useState(true)
  const isOnMobile = useIsOnMobile()
  const localizedPath = useLocalizedPath()

  // Makes it appear/disappear on mobile after scrolling left/right
  useDrag(
    ({ swipe: [xAxis], tap }) => {
      if (xAxis === -1 || tap) {
        setShowToolbar(false)
      }
      if (xAxis === 1) {
        setShowToolbar(true)
      }
    },
    {
      enabled: isOnMobile,
      target: swipeableAreaRef,
      axis: 'x',
      swipe: { duration: 1000 },
      filterTaps: true
    }
  )

  // Automatically closes it on mobile after 1,5 second
  React.useEffect(() => {
    if (isOnMobile) {
      const timeout = setTimeout(() => {
        setShowToolbar(false)
      }, 1500)
      return () => {
        clearTimeout(timeout)
      }
    } else {
      setShowToolbar(true)
    }
  }, [isOnMobile])

  return (
    <div className='z-10 h-0 md:h-auto'>
      <div
        className={clsx(
          'bg-opacity-75 pointer-events-none fixed inset-0 bg-slate-900/10 transition-opacity duration-300 ease-in-out lg:hidden dark:bg-slate-50/10',
          {
            'opacity-0': !showToolbar,
            'opacity-100': showToolbar
          }
        )}
      ></div>
      <div
        className={clsx(
          'fixed top-0 left-0 transition-transform duration-300 ease-in-out lg:static lg:z-0',
          {
            '-translate-x-64': !showToolbar,
            'translate-x-0': showToolbar
          }
        )}
      >
        <div className='flex flex-row items-center gap-2'>
          <div className='flex h-screen w-64 flex-col gap-12 border-r border-slate-300 bg-slate-50 p-2 pt-4 pl-4 shadow-lg transition-colors duration-150 ease-in-out lg:border-0 lg:shadow-none dark:border-slate-600 dark:bg-slate-900'>
            <Link
              to={localizedPath('/')}
              className='flex flex-row items-center gap-2'
            >
              <img
                src={KnucklebonesLogo}
                alt='Knucklebones Logo'
                className='aspect-square h-6'
              />
              <Text
                as='h1'
                className='font-mona text-2xl font-bold tracking-tight'
              >
                Knucklebones
              </Text>
            </Link>
            <SideBarActionContainer>{actions}</SideBarActionContainer>
          </div>
          {isOnMobile && (
            <IconButton
              onClick={() => {
                setShowToolbar((prev) => !prev)
              }}
              icon={<ChevronRightIcon />}
              className={clsx('transition-transform duration-300 ease-in-out', {
                'rotate-180': showToolbar
              })}
            />
          )}
        </div>
      </div>
    </div>
  )
}
