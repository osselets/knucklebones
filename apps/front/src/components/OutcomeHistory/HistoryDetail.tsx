import * as React from 'react'
import { type DetailedHistory } from '@knucklebones/common'
import { getPlayerFromId } from '../../utils/player'
import { type InGameContext } from '../GameContext'
import { Text } from '../Text'
import { PlayerHistoryDetail } from './PlayerHistoryDetail'

interface HistoryDetailProps extends Pick<
  InGameContext,
  'playerOne' | 'playerTwo'
> {
  detailedHistory: DetailedHistory
}

export function HistoryDetail({
  detailedHistory,
  ...players
}: HistoryDetailProps) {
  return (
    <div className='grid-cols-3-central grid gap-x-2 overflow-x-auto'>
      {detailedHistory.map(({ playerOne, playerTwo }, index) => {
        const leftPlayer = getPlayerFromId(playerOne.id, players)
        const rightPlayer = getPlayerFromId(playerTwo.id, players)

        return (
          <React.Fragment
            key={`${playerOne.wins}-${playerTwo.wins}-${
              playerOne.score === playerTwo.score
            }`}
          >
            <PlayerHistoryDetail
              {...playerOne}
              playerName={leftPlayer.inGameName}
              didWin={playerOne.score > playerTwo.score}
            />
            <Text>-</Text>
            <PlayerHistoryDetail
              {...playerTwo}
              playerName={rightPlayer.inGameName}
              didWin={playerTwo.score > playerOne.score}
              isRightSide
            />
            {index < detailedHistory.length - 1 && (
              <div className='col-span-3 h-4 w-0.5 place-self-center bg-slate-300'></div>
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}
