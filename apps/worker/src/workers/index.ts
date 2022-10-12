import {
  ThrowableRouter,
  missing,
  withParams,
  withContent
} from 'itty-router-extras'
import { withDurables } from 'itty-durable'
import { createCors } from 'itty-cors'
import { auth } from '../endpoints/auth'
import { init } from '../endpoints/init'
import { play } from '../endpoints/play'
import { rematch } from '../endpoints/rematch'
import { displayName } from '../endpoints/displayName'

export { GameStateStore } from '../durable-objects/gameStateStore'

const router = ThrowableRouter()
// @ts-expect-error
const { preflight, corsify } = createCors({})

router
  .all('*', withDurables({ parse: true }))
  .options('*', preflight)

  .get('/auth', withParams, auth)
  .get('/:roomKey/:playerId/init', withParams, init)
  .post('/:roomKey/:playerId/play', withParams, withContent, play)
  .post('/:roomKey/:playerId/rematch/', withParams, rematch)
  .post('/:roomKey/:playerId/displayName', withParams, withContent, displayName)

  .all('*', () => missing('Are you sure about that?'))

export default {
  // @ts-expect-error
  fetch: async (...args) => await router.handle(...args).then(corsify)
}
