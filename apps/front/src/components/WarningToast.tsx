import * as React from 'react'
import { Transition } from '@headlessui/react'

interface WarningToastProps {
  message: string | null
  onDismiss(): void
}

export function WarningToast({ message, onDismiss }: WarningToastProps) {
  const [cachedMessage, setCachedMessage] = React.useState<string | null>(
    message
  )

  React.useEffect(() => {
    if (message !== null) {
      setCachedMessage(message)
    }
  }, [message])

  return (
    <Transition
      as='div'
      show={message !== null}
      enter='transition duration-200'
      enterFrom='opacity-0 translate-y-8'
      enterTo='opacity-100 translate-y-0'
      leave='transition duration-200'
      leaveFrom='opacity-100 translate-y-0'
      leaveTo='opacity-0 translate-y-8'
      afterLeave={() => {
        setCachedMessage(null)
      }}
      className='fixed bottom-0 flex w-screen justify-center pb-8'
    >
      <div
        id='toast-warning'
        className='flex w-full max-w-xs items-center rounded-lg bg-white p-4 text-gray-500 shadow dark:bg-gray-800 dark:text-gray-400'
        role='alert'
      >
        <div className='inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-500 dark:bg-orange-700 dark:text-orange-200'>
          <svg
            aria-hidden='true'
            className='h-5 w-5'
            fill='currentColor'
            viewBox='0 0 20 20'
            xmlns='http://www.w3.org/2000/svg'
          >
            <path
              fillRule='evenodd'
              d='M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z'
              clipRule='evenodd'
            ></path>
          </svg>
          <span className='sr-only'>Warning icon</span>
        </div>
        <div className='ml-3 text-sm font-normal'>{cachedMessage}</div>
        <button
          type='button'
          className='-mx-1.5 -my-1.5 ml-auto inline-flex h-8 w-8 rounded-lg bg-white p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-900 focus:ring-2 focus:ring-gray-300 dark:bg-gray-800 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-white'
          data-dismiss-target='#toast-warning'
          aria-label='Close'
          onClick={onDismiss}
        >
          <span className='sr-only'>Close</span>
          <svg
            aria-hidden='true'
            className='h-5 w-5'
            fill='currentColor'
            viewBox='0 0 20 20'
            xmlns='http://www.w3.org/2000/svg'
          >
            <path
              fillRule='evenodd'
              d='M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z'
              clipRule='evenodd'
            ></path>
          </svg>
        </button>
      </div>
    </Transition>
  )
}
