import { useTranslation } from 'react-i18next'
import { clsx } from 'clsx'
import {
  type IPlayer,
  countDiceInColumn,
  type Outcome
} from '@knucklebones/common'
import { Dice } from '../Dice'
import { Cell } from './Cell'
import { Column } from './Column'
import { ColumnScoreTooltip } from './ColumnScore'
import { Name } from './Name'

interface BoardProps {
  columns: IPlayer['columns']
  // TODO: `isReversed` instead?
  isPlayerOne: boolean
  canPlay: boolean
  diceClassName?: string
  onColumnClick?(colIndex: number): void
}

interface PlayerBoardProps extends IPlayer, BoardProps {
  isNextPlayer: boolean
  outcome: Outcome
  isDisplayNameEditable?: boolean
  updateDisplayName?(displayName: string): void
}

const MAX_COLUMNS = 3
const MAX_CELLS_PER_COLUMNS = 3

const COLUMNS_PLACEHOLDER = Array.from({ length: MAX_COLUMNS })
const CELLS_PER_COLUMN_PLACEHOLDER = Array.from({
  length: MAX_CELLS_PER_COLUMNS
})

export function Board({
  columns,
  canPlay,
  isPlayerOne,
  diceClassName,
  onColumnClick
}: BoardProps) {
  return (
    <div
      className={clsx(
        'grid aspect-square grid-cols-3 divide-x-2 divide-slate-300 rounded-lg bg-transparent shadow-lg shadow-slate-300 dark:divide-slate-800 dark:shadow-slate-800',
        {
          'opacity-75': !canPlay
        }
      )}
    >
      {COLUMNS_PLACEHOLDER.map((_, colIndex) => {
        const column = columns[colIndex]
        const countedDice = countDiceInColumn(column)
        const canPlayInColumn = canPlay && column.length < MAX_CELLS_PER_COLUMNS
        return (
          <Column
            key={colIndex}
            readonly={!canPlayInColumn}
            onClick={
              canPlayInColumn ? () => onColumnClick?.(colIndex) : undefined
            }
          >
            {CELLS_PER_COLUMN_PLACEHOLDER.map((_, cellIndex) => {
              // Reverses the render order to mirror the board for the other player
              const actualCellIndex = !isPlayerOne
                ? MAX_CELLS_PER_COLUMNS - cellIndex - 1
                : cellIndex
              const value = column[actualCellIndex]
              return (
                <Cell key={cellIndex}>
                  <Dice
                    value={value}
                    count={countedDice.get(value)}
                    className={diceClassName}
                  />
                </Cell>
              )
            })}
          </Column>
        )
      })}
    </div>
  )
}

export function PlayerBoard({
  id,
  // Peut-être plus simple d'avoir juste une prop `player`
  difficulty,
  dice,
  isPlayerOne,
  score = 0,
  scorePerColumn = [0, 0, 0],
  columns = [[], [], []],
  displayName,
  canPlay,
  isNextPlayer,
  onColumnClick,
  updateDisplayName,
  isDisplayNameEditable = false,
  outcome
}: PlayerBoardProps) {
  const { t } = useTranslation()
  return (
    <div
      className={clsx('flex items-center gap-1 md:gap-4', {
        'flex-col': isPlayerOne,
        'flex-col-reverse': !isPlayerOne,
        'font-semibold': canPlay
      })}
    >
      <Name
        id={id}
        difficulty={difficulty}
        displayName={displayName}
        isPlayerOne={isPlayerOne}
        updateDisplayName={updateDisplayName}
        isEditable={isDisplayNameEditable}
      />
      <div
        className={clsx('grid-cols-3-central grid gap-4 md:gap-8', {
          'items-end': isPlayerOne,
          'items-start': !isPlayerOne
        })}
      >
        <div className='my-4'>
          <Dice
            value={outcome === 'ongoing' ? dice : undefined}
            showUndefined={isNextPlayer}
          />
        </div>
        <div
          className={clsx('flex items-center gap-1 md:gap-4', {
            'flex-col': isPlayerOne,
            'flex-col-reverse': !isPlayerOne
          })}
        >
          <div className='grid w-full grid-cols-3'>
            {scorePerColumn.map((score, index) => (
              <ColumnScoreTooltip
                score={score}
                dice={columns[index]}
                isPlayerOne={isPlayerOne}
                key={index}
              />
            ))}
          </div>
          <Board
            isPlayerOne={isPlayerOne}
            canPlay={isPlayerOne && canPlay}
            columns={columns}
            onColumnClick={onColumnClick}
          />
        </div>
        <div className='my-4'>
          <p>
            {t('game.total')}: {score}
          </p>
        </div>
      </div>
    </div>
  )
}
