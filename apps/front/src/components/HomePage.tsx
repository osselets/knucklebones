import * as React from 'react'
import { Link } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'
import { Transition } from '@headlessui/react'
import { capitalize } from '@knucklebones/common'
import KnucklebonesLogo from '../svgs/logo.svg'
import { Button } from './Button'
import { Theme } from './Theme'
import { Disclaimer } from './Disclaimer'
import { CodeBracketIcon, EnvelopeIcon } from '@heroicons/react/24/outline'

export function HomePage() {
  const [showAiDifficulty, setShowAiDifficulty] = React.useState(false)
  const [showBos, setShowBos] = React.useState(false)

  return (
    <>
      <div className='flex flex-col items-center justify-center gap-8'>
        <div className='flex flex-row items-center gap-2 md:gap-4'>
          <img
            src={KnucklebonesLogo}
            alt='Knucklebones Logo'
            className='aspect-square h-16 md:h-32'
          />
          <h1 className='font-mona text-4xl font-bold tracking-tight md:text-8xl'>
            Knucklebones
          </h1>
        </div>
        <div className='flex flex-col gap-8'>
          <Button
            size='large'
            onClick={() => {
              setShowAiDifficulty(false)
              setShowBos(!showBos)
            }}
          >
            Play against a friend
          </Button>
          <Transition
            show={showBos}
            className='flex flex-row justify-center gap-4'
            enter='transition ease-in-out duration-300 transform'
            enterFrom='opacity-0 -translate-y-8'
            enterTo='opacity-100 translate-y-0'
            leave='transition ease-in-out duration-300 transform'
            leaveFrom='opacity-100 translate-y-0'
            leaveTo='opacity-0 -translate-y-8'
          >
            {['Best of 1', 'Best of 3', 'Best of 5'].map((bos) => {
              return (
                <Button
                  key={bos}
                  as={Link}
                  to={`/room/${uuidv4()}`}
                  state={{ bo: bos }}
                  size='medium'
                >
                  {bos}
                </Button>
              )
            })}
          </Transition>
          <Button
            size='large'
            onClick={() => {
              setShowBos(false)
              setShowAiDifficulty(!showAiDifficulty)
            }}
          >
            Play against an AI
          </Button>
          <Transition
            show={showAiDifficulty}
            className='flex flex-row justify-center gap-4'
            enter='transition ease-in-out duration-300 transform'
            enterFrom='opacity-0 -translate-y-8'
            enterTo='opacity-100 translate-y-0'
            leave='transition ease-in-out duration-300 transform'
            leaveFrom='opacity-100 translate-y-0'
            leaveTo='opacity-0 -translate-y-8'
          >
            {['easy', 'medium', 'hard'].map((difficulty) => {
              return (
                <Button
                  key={difficulty}
                  as={Link}
                  to={`/room/${uuidv4()}`}
                  state={{ playerType: 'ai', difficulty }}
                  size='medium'
                >
                  {capitalize(difficulty)}
                </Button>
              )
            })}
          </Transition>
          <Button as={Link} size='large' to='/how-to-play'>
            How to play
          </Button>
        </div>
        <div className='absolute bottom-0 flex flex-col gap-2 p-2'>
          <Disclaimer />
          <div className='flex flex-row justify-center gap-4'>
            <a
              className='text-slate-900 transition-all hover:text-slate-900/80 dark:text-slate-200 dark:hover:text-slate-50/80'
              href='https://github.com/Poooel/knucklebones'
              target='_blank'
              rel='noreferrer'
            >
              <div className='aspect-square h-6'>
                <CodeBracketIcon />
              </div>
            </a>
            <a
              className='text-slate-900 transition-all hover:text-slate-900/80 dark:text-slate-200 dark:hover:text-slate-50/80'
              href='mailto:contact@knucklebones.io'
              target='_blank'
              rel='noreferrer'
            >
              <div className='aspect-square h-6'>
                <EnvelopeIcon />
              </div>
            </a>
          </div>
        </div>
      </div>
      <div className='fixed top-0 right-0 p-2 md:p-4'>
        <Theme />
      </div>
    </>
  )
}
