import { type IDicePool } from '../interfaces/IDicePool'
import { getRandomIntInclusive } from '../utils'

export class DicePool implements IDicePool {
  pool: number[]

  constructor(pool?: number[]) {
    this.pool = pool ?? this.generateDicePool(3)
  }

  public getAndRemoveDieFromPool() {
    const index = getRandomIntInclusive(0, this.pool.length - 1)
    const die = this.pool[index]
    this.pool.splice(index, 1)
    return die
  }

  public putDieBackInPool(die: number, occurrences: number) {
    for (let occ = 0; occ < occurrences; occ++) {
      this.pool.push(die)
    }
  }

  public toJson(): IDicePool {
    return {
      pool: this.pool
    }
  }

  private generateDicePool(occurrencesPerValue: number) {
    const pool: number[] = []
    for (let die = 1; die <= 6; die++) {
      for (let occ = 0; occ < occurrencesPerValue; occ++) {
        pool.push(die)
      }
    }
    return pool
  }
}
