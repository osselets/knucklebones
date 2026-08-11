export interface RankedStatsTimePoint {
  timestamp: number
  value: number
}

export interface RankedStats {
  generatedAt: number
  totals: {
    players: number
    matches: number
    wins: number
    draws: number
    losses: number
    averageEloGain: number
  }
  current: {
    activePlayers: number
    queuedPlayers: number
  }
  history: {
    players: RankedStatsTimePoint[]
    queue: RankedStatsTimePoint[]
  }
}
