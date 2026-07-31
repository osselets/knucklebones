import type * as React from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { Dialog, Transition } from '@headlessui/react'
import { IconButton } from './IconButton'

export interface ModalProps {
  isOpen: boolean
  className?: string
  onClose(): void
  onAfterClose?(): void
}

function ModalTitle({ children }: React.PropsWithChildren) {
  return (
    <Dialog.Title className='mb-4 text-center text-xl font-medium md:text-2xl'>
      {children}
    </Dialog.Title>
  )
}

export function Modal({
  isOpen,
  children,
  onClose,
  onAfterClose
}: React.PropsWithChildren<ModalProps>) {
  return (
    <Transition.Root show={isOpen} afterLeave={onAfterClose}>
      <Dialog className='relative z-20' onClose={onClose}>
        <Transition.Child
          enter='ease-out duration-300'
          enterFrom='opacity-0'
          enterTo='opacity-100'
          leave='ease-in duration-200'
          leaveFrom='opacity-100'
          leaveTo='opacity-0'
        >
          <div className='bg-opacity-75 fixed inset-0 bg-slate-900/10 transition-opacity dark:bg-slate-50/10' />
        </Transition.Child>

        <div className='fixed inset-0 overflow-y-auto'>
          <div className='flex min-h-full items-center justify-center p-4 text-center'>
            <Transition.Child
              enter='ease-out duration-300'
              enterFrom='opacity-0 translate-y-4'
              enterTo='opacity-100 translate-y-0'
              leave='ease-in duration-200'
              leaveFrom='opacity-100 translate-y-0'
              leaveTo='opacity-0 translate-y-4'
            >
              <Dialog.Panel className='relative transform overflow-hidden rounded-lg bg-slate-50 p-8 text-left text-slate-900 shadow-xl transition-all dark:bg-slate-900 dark:text-slate-200'>
                <IconButton
                  onClick={onClose}
                  icon={<XMarkIcon />}
                  className='absolute top-0 right-0 p-2'
                />
                {children}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  )
}

Modal.Title = ModalTitle
