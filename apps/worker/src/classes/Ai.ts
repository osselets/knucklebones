import {
  countDiceInColumn,
  type Difficulty,
  getColumnScore,
  getMaxBy,
  getMinBy,
  type Player,
  sortBy
} from '@knucklebones/common'

interface WeightedPlay {
  gain: number
  risk: number
  score: number
  column: number
}

type Strategy = 'defensive' | 'offensive'

export class Ai {
  human: Player
  ai: Player
  dice: number
  difficulty: Difficulty

  constructor(human: Player, ai: Player, dice: number, difficulty: Difficulty) {
    this.human = human
    this.ai = ai
    this.dice = dice
    this.difficulty = difficulty
  }

  suggestNextPlay() {
    const weightedPlays = this.weighPossiblePlays()

    if (this.ai.score > this.human.score) {
      return this.getRecommendedPlay(weightedPlays, 'defensive')
    } else {
      return this.getRecommendedPlay(weightedPlays, 'offensive')
    }
  }

  private getRecommendedPlay(
    weightedPlays: WeightedPlay[],
    strategy: Strategy
  ): WeightedPlay {
    const sortedWeightedPlays = sortBy(
      weightedPlays,
      ({ score }) => score,
      'ascending'
    )
    // Defaults when there's not enough plays (e.g. column is full)
    const [easy, medium = easy, hard = medium] = sortedWeightedPlays

    let recommendedPlay: WeightedPlay

    switch (this.difficulty) {
      case 'easy':
        recommendedPlay = easy
        break
      case 'medium':
        recommendedPlay = medium
        break
      case 'hard':
        recommendedPlay = hard
        break
    }

    const duplicatePlays = weightedPlays.filter(
      (value) => value.score === recommendedPlay.score
    )

    if (duplicatePlays.length > 1) {
      if (strategy === 'offensive') {
        return getMaxBy(duplicatePlays, ({ gain }) => gain)
      } else {
        return getMinBy(duplicatePlays, ({ risk }) => risk)
      }
    } else {
      return recommendedPlay
    }
  }

  private weighPossiblePlays(): WeightedPlay[] {
    const weightedPlays: WeightedPlay[] = []

    this.ai.columns.forEach((_, column) => {
      if (this.ai.columns[column].length < 3) {
        weightedPlays.push(this.weighPlayInColumn(column))
      }
    })

    return weightedPlays
  }

  private weighPlayInColumn(column: number): WeightedPlay {
    const gain = this.evaluateGainInColumn(column)
    const risk = this.evaluateRiskInColumn(column)
    const score = gain - risk

    return { gain, risk, score, column }
  }

  private evaluateGainInColumn(column: number): number {
    const aiColumn = this.ai.columns[column]

    if (aiColumn.length === 3) {
      return 0
    }

    const aiNewColumn = aiColumn.concat(this.dice)

    const aiScore = getColumnScore(aiColumn)
    const aiNewScore = getColumnScore(aiNewColumn)

    const aiScoreDifference = aiNewScore - aiScore

    const humanColumn = this.human.columns[column]
    const humanNewColumn = humanColumn.filter(
      (diceToRemove) => diceToRemove !== this.dice
    )

    const humanScore = getColumnScore(humanColumn)
    const humanNewScore = getColumnScore(humanNewColumn)

    const humanScoreDifference = humanScore - humanNewScore

    const openSlots = 2 - aiColumn.length

    return aiScoreDifference + humanScoreDifference + openSlots
  }

  private evaluateRiskInColumn(column: number): number {
    const riskFromDiceInAiColumn = this.getMaxInMapValues(
      countDiceInColumn(this.ai.columns[column])
    )
    const riskFromOpenSlotsInHumanColumn = 3 - this.human.columns[column].length
    const riskFromScoreDifference = this.compareScores(column)

    return (
      riskFromDiceInAiColumn +
      riskFromOpenSlotsInHumanColumn +
      riskFromScoreDifference
    )
  }

  private getMaxInMapValues(map: Map<number, number>) {
    let max = 0

    map.forEach((value) => {
      if (value > max) {
        max = value
      }
    })

    return max
  }

  private compareScores(column: number) {
    const aiScore = getColumnScore(this.ai.columns[column])
    const humanScore = getColumnScore(this.human.columns[column])

    if (aiScore > humanScore) {
      return 1
    } else if (aiScore < humanScore) {
      return -1
    } else {
      return 0
    }
  }
}
