import * as React from 'react'
import {
  useClick,
  useFloating,
  useHover,
  useInteractions,
  useDismiss
} from '@floating-ui/react'
import { countDiceInColumn } from '@knucklebones/common'
import { Dice } from '../Dice'

interface CountedDiceProps {
  value: number
  count: number
}

function CountedDice({ value, count }: CountedDiceProps) {
  if (count === 1) {
    return <Dice value={value} count={count} size='small' />
  }
  return (
    // TODO: div (dice) shouldn't be in p
    <p className='flex flex-row items-center gap-1'>
      <span>(</span>
      {Array.from({ length: count }).map((_, i) => (
        <React.Fragment key={i}>
          <Dice value={value} count={count} size='small' />
          {i + 1 < count && <span>+</span>}
        </React.Fragment>
      ))}
      <span>) x {count}</span>
    </p>
  )
}

interface ColumnScoreProps {
  dice: number[]
  score: number
  showScore?: boolean
}

export function ColumnScore({
  dice,
  score,
  showScore = false
}: ColumnScoreProps) {
  const countedDice = countDiceInColumn(dice)

  return (
    <div className='flex flex-row items-center gap-2 font-normal'>
      {[...countedDice.entries()].map(([value, count], index) => (
        <React.Fragment key={index}>
          <CountedDice value={value} count={count} />
          {index + 1 < countedDice.size && <span>+</span>}
        </React.Fragment>
      ))}
      {showScore && <span> = {score}</span>}
    </div>
  )
}

interface ColumnScoreTooltipProps extends ColumnScoreProps {
  isPlayerOne: boolean
}

export function ColumnScoreTooltip({
  dice,
  score,
  isPlayerOne
}: ColumnScoreTooltipProps) {
  const [showTooltip, setShowTooltip] = React.useState(false)
  const { x, y, refs, strategy, context } = useFloating({
    placement: isPlayerOne ? 'top' : 'bottom',
    open: showTooltip,
    onOpenChange(open) {
      if (score > 0 || !open) {
        setShowTooltip(open)
      }
    }
  })
  const { getReferenceProps, getFloatingProps } = useInteractions([
    useHover(context, { mouseOnly: true, delay: { open: 100 } }),
    useClick(context, { ignoreMouse: true }),
    useDismiss(context)
  ])

  return (
    <>
      <p
        ref={refs.setReference}
        className='text-center'
        {...getReferenceProps()}
      >
        {score}
      </p>
      {showTooltip && score > 0 && (
        <div
          ref={refs.setFloating}
          style={{
            position: strategy,
            top: y ?? 0,
            left: x ?? 0
          }}
          className='w-max rounded bg-slate-200 p-2 text-slate-900 shadow shadow-slate-300 dark:bg-slate-700 dark:text-slate-50 dark:shadow-slate-800'
          {...getFloatingProps()}
        >
          <ColumnScore dice={dice} score={score} />
        </div>
      )}
    </>
  )
}
