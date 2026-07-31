import { type GameStateDurableObjectProps } from '../durable-objects/GameStateDurableObject'

export type PromisifyPublicFunctions<T> = {
  [K in keyof T]: T[K] extends (...args: infer Args) => infer Result
    ? (...args: Args) => Promise<Awaited<Result>>
    : never
}

export interface IttyDurableObjectNamespace<T> {
  get(id: string | DurableObjectId): PromisifyPublicFunctions<T>
}

export interface BaseRequestWithProps extends GameStateDurableObjectProps {
  roomKey: string
  playerId: string
}
