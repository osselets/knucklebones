import { type AuthenticatedPrincipal } from '@knucklebones/common'
import { type GameStateDurableObjectProps } from '../durable-objects/GameStateDurableObject'

export type PromisifyPublicFunctions<T> = {
  [K in keyof T]: T[K] extends (...args: infer Args) => infer Result
    ? (...args: Args) => Promise<Awaited<Result>>
    : never
}

export interface IttyDurableObjectNamespace<T> {
  get(id: string | DurableObjectId): PromisifyPublicFunctions<T>
}

export interface RequestWithId {
  requestId: string
}

export interface RequestWithMutationId {
  mutationId: string
}

export interface AuthenticatedRequestWithProps extends RequestWithId {
  principal: AuthenticatedPrincipal
}

export interface DurableRoomRequestWithProps
  extends GameStateDurableObjectProps, RequestWithId {
  roomKey: string
}

export interface AuthenticatedRoomRequestWithProps
  extends DurableRoomRequestWithProps, AuthenticatedRequestWithProps {}

export interface AuthenticatedMutationRoomRequestWithProps
  extends AuthenticatedRoomRequestWithProps, RequestWithMutationId {}

export interface BaseRequestWithProps extends AuthenticatedRoomRequestWithProps {
  playerId: string
}

export interface MutationRequestWithProps
  extends BaseRequestWithProps, RequestWithMutationId {}
