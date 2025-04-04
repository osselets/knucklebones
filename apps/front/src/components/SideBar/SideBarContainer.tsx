import * as React from 'react'
import { Link } from 'react-router-dom'
import { useClickAway } from 'react-use'
import { ChevronRightIcon } from '@heroicons/react/24/outline'
import { clsx } from 'clsx'
import { useIsOnMobile } from '../../hooks/detectDevice'
import KnucklebonesLogo from '../../svgs/logo.svg'
import { IconButton } from '../IconButton'
import { Text } from '../Text'
import { SideBarActionContainer } from './SideBarActions'

export interface SideBarContainerProps {
  actions: React.ReactNode
}

// https://ui.shadcn.com/docs/components/sheet ?
export function SideBarContainer({ actions }: SideBarContainerProps) {
  // Always displayed by default
  const [show, setShow] = React.useState(true)
  const isOnMobile = useIsOnMobile()

  function close() {
    if (isOnMobile) {
      setShow(false)
    }
  }

  const sideBarRef = React.useRef<React.ElementRef<'div'>>(null)
  useClickAway(sideBarRef, close)

  // Automatically closes it on mobile after 1,5 second
  React.useEffect(() => {
    if (isOnMobile) {
      const timeout = setTimeout(() => {
        setShow(false)
      }, 1500)
      return () => {
        clearTimeout(timeout)
      }
    } else {
      setShow(true)
    }
  }, [isOnMobile])

  return (
    <div className='z-10 h-0 md:h-auto'>
      <div
        className={clsx(
          'pointer-events-none fixed inset-0 bg-slate-900/10 bg-opacity-75 transition-opacity duration-300 ease-in-out lg:hidden dark:bg-slate-50/10',
          {
            'opacity-0': !show,
            'opacity-100': show
          }
        )}
      ></div>
      <div
        className={clsx(
          'fixed left-0 top-0 transition-transform duration-300 ease-in-out lg:static lg:z-0',
          {
            '-translate-x-64': !show,
            'translate-x-0': show
          }
        )}
      >
        <div ref={sideBarRef} className='flex flex-row gap-2'>
          <div className='flex h-screen w-64 flex-col gap-12 border-r border-slate-300 bg-slate-50 p-2 pl-4 pt-4 shadow-lg transition-colors duration-150 ease-in-out lg:border-0 lg:shadow-none dark:border-slate-600 dark:bg-slate-900'>
            <Link
              to='/'
              onClick={close}
              className='flex flex-row items-center gap-2 underline decoration-transparent decoration-4 underline-offset-2 transition-all duration-100 ease-in-out hover:decoration-slate-900 dark:hover:decoration-slate-50'
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
            <div className='flex items-center' onClick={close}>
              <IconButton
                onClick={(e) => {
                  // Solution à revoir, c'est fonctionnel mais y a un mix entre
                  // custom et useClickAway
                  e.stopPropagation()
                  setShow((prev) => !prev)
                }}
                icon={<ChevronRightIcon />}
                className={clsx(
                  'rounded-full p-1 transition duration-300 ease-in-out',
                  {
                    'rotate-180 bg-slate-50 dark:bg-slate-900': show
                  }
                )}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
