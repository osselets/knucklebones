import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { PlayIcon } from '@heroicons/react/24/outline'
import { t } from 'i18next'
import { useIsOnDesktop } from '../hooks/detectDevice'
import { useLocalizedPath } from '../hooks/useLocalizedPath'
import { useRoomKey } from '../hooks/useRoomKey'
import { getRankedProfile } from '../utils/api'
import { getStoredPlayerId } from '../utils/identityStorage'
import { getStoredRankedMatchAssignment } from '../utils/rankedMatchStorage'
import { Button } from './Button'
import { useGame, type InGameContext } from './GameContext'
import { ShortcutModal } from './ShortcutModal'

type GetWinMessageArgs = Pick<
  InGameContext,
  | 'finishReason'
  | 'forfeitReason'
  | 'outcome'
  | 'playerOne'
  | 'playerSide'
  | 'playerTwo'
  | 'winner'
>

function getWinMessage({
  finishReason,
  forfeitReason,
  outcome,
  playerOne,
  playerSide,
  playerTwo,
  winner
}: GetWinMessageArgs) {
  if (outcome !== 'ongoing') {
    if (winner !== undefined) {
      if (
        outcome === 'game-ended' &&
        finishReason === 'forfeit' &&
        forfeitReason !== undefined
      ) {
        if (playerSide === 'spectator') {
          const loser = winner.id === playerOne.id ? playerTwo : playerOne
          return t(`game.forfeit.${forfeitReason}.spectator` as const, {
            loser: loser.inGameName,
            winner: winner.inGameName
          })
        }
        return t(
          `game.forfeit.${forfeitReason}.${
            winner.isPlayerOne ? 'you-win' : 'opponent-win'
          }` as const,
          { player: winner.inGameName }
        )
      }
      const gameScope = outcome === 'round-ended' ? 'round' : 'game'
      const playerWin = winner.isPlayerOne ? 'you-win' : 'opponent-win'
      return t(`game.${gameScope}.${playerWin}` as const, {
        player: winner.inGameName,
        points: winner.score
      })
    }
    return t(outcome === 'round-ended' ? 'game.round.tie' : 'game.game.tie')
  }
  return ''
}

interface VoteButtonProps extends Pick<InGameContext, 'boType' | 'outcome'> {
  hasVoted: boolean
  onRematch(): void
  onContinue(): void
  onContinueIndefinitely(): void
}

function VoteButtons({
  boType,
  hasVoted,
  outcome,
  onContinue,
  onContinueIndefinitely,
  onRematch
}: VoteButtonProps) {
  const { t } = useTranslation()
  if (boType !== 'indefinite') {
    if (outcome === 'round-ended') {
      return (
        <Button onClick={onContinue} disabled={hasVoted}>
          {t('game.continue')}
        </Button>
      )
    }
    if (outcome === 'game-ended') {
      return (
        <div className='flex flex-col items-center gap-2 md:flex-row'>
          <Button onClick={onRematch} disabled={hasVoted}>
            {t('game.rematch')}
          </Button>
          <Button onClick={onContinueIndefinitely} disabled={hasVoted}>
            {t('game.go-free-play')}
          </Button>
        </div>
      )
    }
  }
  return (
    <Button onClick={onRematch} disabled={hasVoted}>
      {t('game.rematch')}
    </Button>
  )
}

export function GameOutcome() {
  const {
    outcome,
    winner,
    finishReason,
    forfeitReason,
    playerSide,
    playerOne,
    playerTwo,
    rematchVote,
    boType,
    voteRematch,
    voteContinueBo,
    voteContinueIndefinitely
  } = useGame()
  const isSpectator = playerSide === 'spectator'
  const hasVoted = rematchVote === playerOne.id
  const isOnDesktop = useIsOnDesktop()
  const { t } = useTranslation()
  const roomKey = useRoomKey()
  const rankedAssignment = React.useMemo(
    () => getStoredRankedMatchAssignment(roomKey),
    [roomKey]
  )
  const [rankedRating, setRankedRating] = React.useState<number>()
  const [rankedRatingError, setRankedRatingError] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    if (outcome === 'game-ended' && rankedAssignment !== undefined) {
      void getRankedProfile()
        .then((profile) => {
          if (!cancelled) {
            setRankedRating(profile.rating)
            setRankedRatingError(false)
          }
        })
        .catch(() => {
          if (!cancelled) {
            setRankedRatingError(true)
          }
        })
    }
    return () => {
      cancelled = true
    }
  }, [outcome, rankedAssignment])

  if (outcome === 'ongoing') {
    // On peut mettre un VS semi-transparent dans le fond de la partie
    // pour rappeler cet élément sans pour autant que ça prenne de l'espace dans
    // le layout.
    return <p className='hidden lg:block'>VS</p>
  }

  const content = (
    <div className='grid justify-items-center gap-2 font-semibold'>
      <p>
        {getWinMessage({
          finishReason,
          forfeitReason,
          outcome,
          playerOne,
          playerSide,
          playerTwo,
          winner
        })}
      </p>
      {!isSpectator && rankedAssignment !== undefined ? (
        <RankedResultRating
          assignment={rankedAssignment}
          rating={rankedRating}
          hasError={rankedRatingError}
        />
      ) : !isSpectator ? (
        <VoteButtons
          boType={boType}
          hasVoted={hasVoted}
          outcome={outcome}
          onContinue={() => {
            void voteContinueBo()
          }}
          onContinueIndefinitely={() => {
            void voteContinueIndefinitely()
          }}
          onRematch={() => {
            void voteRematch()
          }}
        />
      ) : null}

      {!isSpectator &&
        rankedAssignment === undefined &&
        (hasVoted ? (
          <p>{t('game.waiting-rematch', { player: playerTwo.inGameName })}</p>
        ) : (
          rematchVote !== undefined && ( // It means the other player has voted for rematch
            <p>
              {t('game.opponent-rematch', { player: playerTwo.inGameName })}
            </p>
          )
        ))}
    </div>
  )

  if (isOnDesktop) {
    return content
  }

  return (
    <ShortcutModal
      icon={<PlayIcon />}
      label={t('game.continue')}
      isInitiallyOpen
    >
      {content}
    </ShortcutModal>
  )
}

function RankedResultRating({
  assignment,
  hasError,
  rating
}: {
  assignment: NonNullable<ReturnType<typeof getStoredRankedMatchAssignment>>
  hasError: boolean
  rating?: number
}) {
  const { t } = useTranslation()
  const localizedPath = useLocalizedPath()
  const playerId = getStoredPlayerId()
  const previousRating =
    playerId === assignment.playerOneId
      ? assignment.playerOneRating
      : assignment.playerTwoRating
  const change = rating === undefined ? undefined : rating - previousRating

  return (
    <div className='flex flex-col items-center gap-2'>
      <p>
        {hasError
          ? t('ranked.result.rating-error')
          : rating === undefined || change === undefined
            ? t('ranked.rating-loading')
            : t('ranked.result.rating-change', {
                before: previousRating,
                after: rating,
                change: change > 0 ? `+${change}` : String(change)
              })}
      </p>
      <Button as={Link} to={localizedPath('/ranked')}>
        {t('ranked.result.play-again')}
      </Button>
    </div>
  )
}
