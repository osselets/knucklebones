import * as React from 'react'
import { clsx } from 'clsx'
import { Transition } from '@headlessui/react'

type DiceSize = 'medium' | 'small'
type DiceVariant = 'solid' | 'outline'

interface DiceStyle {
  size?: DiceSize
  variant?: DiceVariant
}

interface DiceProps extends DiceStyle {
  value?: number
  className?: string
  count?: number
  showUndefined?: boolean
}
interface DotProps {
  className?: string
}

const baseClassName =
  'aspect-square h-12 portrait:md:h-16 landscape:md:h-12 landscape:lg:h-16'
const smallClassName = 'aspect-square h-6'

const DiceStyleContext = React.createContext<Required<DiceStyle>>({
  size: 'medium',
  variant: 'solid'
})

function DicePlaceholder({ className }: DotProps) {
  const { size } = React.useContext(DiceStyleContext)
  return (
    <div
      className={clsx(className, {
        [baseClassName]: size === 'medium',
        [smallClassName]: size === 'small'
      })}
    ></div>
  )
}

function DiceContainer({ children }: React.PropsWithChildren) {
  const { size } = React.useContext(DiceStyleContext)
  return (
    <div
      className={clsx(
        'grid h-full w-full grid-cols-3 grid-rows-3 place-items-center p-1',
        {
          'lg:p-2': size === 'medium'
        }
      )}
    >
      {children}
    </div>
  )
}

function Dot({ className }: DotProps) {
  const { size } = React.useContext(DiceStyleContext)
  return (
    <div
      className={clsx(
        'aspect-square rounded-full bg-slate-900 dark:bg-slate-200',
        className,
        {
          'h-2 portrait:md:h-3 landscape:md:h-2 landscape:lg:h-3':
            size === 'medium',
          'h-1': size === 'small'
        }
      )}
    ></div>
  )
}

function DiceOne() {
  return (
    <DiceContainer>
      <Dot className='col-start-2 row-start-2' />
    </DiceContainer>
  )
}

function DiceTwo() {
  return (
    <DiceContainer>
      <Dot />
      <Dot className='col-start-3 row-start-3' />
    </DiceContainer>
  )
}

function DiceThree() {
  return (
    <DiceContainer>
      <Dot />
      <Dot className='col-start-2 row-start-2' />
      <Dot className='col-start-3 row-start-3' />
    </DiceContainer>
  )
}

function DiceFour() {
  return (
    <DiceContainer>
      <Dot />
      <Dot className='col-start-3 row-start-1' />
      <Dot className='col-start-1 row-start-3' />
      <Dot className='col-start-3 row-start-3' />
    </DiceContainer>
  )
}

function DiceFive() {
  return (
    <DiceContainer>
      <Dot />
      <Dot className='col-start-3 row-start-1' />
      <Dot className='col-start-2 row-start-2' />
      <Dot className='col-start-1 row-start-3' />
      <Dot className='col-start-3 row-start-3' />
    </DiceContainer>
  )
}

function DiceSix() {
  return (
    <DiceContainer>
      <Dot className='col-start-1 row-start-1' />
      <Dot className='col-start-1 row-start-2' />
      <Dot className='col-start-1 row-start-3' />
      <Dot className='col-start-3 row-start-1' />
      <Dot className='col-start-3 row-start-2' />
      <Dot className='col-start-3 row-start-3' />
    </DiceContainer>
  )
}

function DiceUndefined() {
  return (
    <DiceContainer>
      <p className='col-start-2 row-start-2 text-xl font-semibold md:text-2xl'>
        ?
      </p>
    </DiceContainer>
  )
}

const DiceMap: Record<number | 'undefined', React.ComponentType> = {
  undefined: DiceUndefined,
  1: DiceOne,
  2: DiceTwo,
  3: DiceThree,
  4: DiceFour,
  5: DiceFive,
  6: DiceSix
}

function SimpleDice({ value, className, count = 1 }: DiceProps) {
  const DiceValue = DiceMap[value ?? 'undefined']
  const { size, variant } = React.useContext(DiceStyleContext)
  return (
    <div
      // cva pour rendre ça plus lisible avec une meilleur définition des variantes composites
      className={clsx(
        'flex select-none flex-row items-center justify-center rounded border',
        className,
        {
          'border-slate-900 dark:border-slate-50': variant === 'outline'
        },
        variant === 'solid' && {
          'border-stone-400 bg-stone-300 shadow-stone-400 dark:border-stone-600 dark:bg-stone-500 dark:shadow-stone-600':
            count === 1,
          'border-amber-400 bg-amber-300 shadow-amber-400 dark:border-amber-700 dark:bg-amber-600 dark:shadow-amber-700':
            count === 2,
          'border-indigo-400 bg-indigo-300 shadow-indigo-400 dark:border-indigo-700 dark:bg-indigo-600 dark:shadow-indigo-700':
            count === 3
        },
        {
          [baseClassName]: size === 'medium',
          shadow: size === 'medium',
          [smallClassName]: size === 'small'
        }
      )}
    >
      <DiceValue />
    </div>
  )
}

export function Dice({
  value,
  className,
  count = 1,
  showUndefined = false,
  variant = 'solid',
  size = 'medium'
}: DiceProps) {
  // Temporarily store the dice value to keep the dice shown during the
  // transition after it has been unset. While the animation is done, the cached
  // value is reset. When the value is set, it will update the cached value.
  const [cachedValue, setCachedValue] = React.useState<number | undefined>(
    value
  )

  React.useEffect(() => {
    if (value !== undefined) {
      setCachedValue(value)
    }
  }, [value])

  return (
    // Sharing the variant in a context so it's easier to drill it down
    <DiceStyleContext.Provider value={{ variant, size }}>
      <Transition
        show={Boolean(value) || showUndefined}
        className={clsx('transition duration-100 ease-in-out', className)}
        enterFrom='opacity-0 scale-75'
        enterTo='opacity-100 scale-100'
        leaveFrom='opacity-100 scale-100'
        leaveTo='opacity-0 scale-75'
        afterLeave={() => {
          setCachedValue(undefined)
        }}
      >
        <SimpleDice value={cachedValue} count={count} className={className} />
      </Transition>
      {/*
        Cannot show `DicePlaceholder` within `Transition` when `shown` is
        false, since the `Transition` block isn't rendered.
      */}
      {cachedValue === undefined && !showUndefined && (
        <DicePlaceholder className={className} />
      )}
    </DiceStyleContext.Provider>
  )
}
