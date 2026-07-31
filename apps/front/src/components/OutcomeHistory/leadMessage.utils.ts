import { t } from 'i18next'
import { type GameOutcome } from '@knucklebones/common'
import { getPlayerFromId } from '../../utils/player'
import { type InGameContext } from '../GameContext'

interface GetLeadMessageArgs extends Pick<
  InGameContext,
  'playerOne' | 'playerTwo' | 'boType'
> {
  gameOutcome: GameOutcome
}
export function getLeadMessage({
  boType,
  gameOutcome,
  ...players
}: GetLeadMessageArgs) {
  const { playerOne, playerTwo } = gameOutcome

  if (playerOne.wins === playerTwo.wins) {
    if (playerOne.wins === 0) {
      return t('menu.history.empty-round')
    }
    return t('menu.history.tie')
  }

  const { id } = playerOne.wins > playerTwo.wins ? playerOne : playerTwo
  const leadingPlayer = getPlayerFromId(id, players)

  // `boType` est considéré comme un `string`, je sais pas trop pourquoi
  const gameScope =
    boType !== 'indefinite' &&
    Number(boType) === playerOne.wins + playerTwo.wins
      ? 'win'
      : 'lead'
  const playerWin = leadingPlayer.isPlayerOne ? 'you' : 'opponent'

  return t(`menu.history.${playerWin}-${gameScope}` as const, {
    player: leadingPlayer.inGameName
  })
}
