import { expect, test, type Page } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

interface StoredIdentity {
  displayName: string
  playerCredential: string
  playerId: string
}

async function waitForHome(page: Page) {
  await page.goto('/')
  await expect(
    page.getByRole('button', { name: 'Play against an AI' })
  ).toBeVisible()

  const acknowledgeRecovery = page.getByRole('button', {
    name: "I've saved it"
  })
  if (await acknowledgeRecovery.isVisible()) {
    await acknowledgeRecovery.click()
    await page.keyboard.press('Escape')
  }
}

async function readIdentity(page: Page): Promise<StoredIdentity> {
  return await page.evaluate(() => ({
    displayName: localStorage.getItem('knucklebones.identity.v1.displayName')!,
    playerCredential: localStorage.getItem(
      'knucklebones.identity.v1.deviceCredential'
    )!,
    playerId: localStorage.getItem('knucklebones.identity.v1.playerId')!
  }))
}

async function chooseGame(
  page: Page,
  opponent: 'Play against an AI' | 'Play against someone'
) {
  await page.getByRole('button', { name: opponent }).click()
}

test('keeps a UUID identity private behind a persistent friendly name', async ({
  page
}) => {
  await waitForHome(page)
  const originalIdentity = await readIdentity(page)

  expect(originalIdentity.playerId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  )
  expect(originalIdentity.playerCredential).toMatch(
    /^(?:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}_)?[0-9a-f]{64}$/
  )
  expect(originalIdentity.displayName).not.toBe(originalIdentity.playerId)

  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Play against an AI' })
  ).toBeVisible()

  expect(await readIdentity(page)).toEqual(originalIdentity)
})

test('starts a hard BO1 AI game with valid versioned state updates', async ({
  page
}) => {
  const gameStateMessages: Array<Record<string, unknown>> = []
  page.on('websocket', (webSocket) => {
    webSocket.on('framereceived', ({ payload }) => {
      if (typeof payload !== 'string') return
      try {
        const message = JSON.parse(payload) as Record<string, unknown>
        if (message.type === 'game.state') gameStateMessages.push(message)
      } catch {
        // Vite's development socket can send non-JSON frames.
      }
    })
  })

  await waitForHome(page)
  await chooseGame(page, 'Play against an AI')
  await page.getByRole('radio', { name: 'Hard' }).click()
  await page.getByRole('radio', { name: 'Best of 1' }).click()
  await page.getByRole('link', { name: 'Start game' }).click()

  await expect(page.getByText('Round 1 of 1')).toBeVisible()
  await expect(page.getByText('AI (Hard)')).toBeVisible()
  await expect(page.getByText('Waiting for game to start...')).toHaveCount(0)
  await expect.poll(() => gameStateMessages.length).toBeGreaterThan(0)

  const columns = page.locator('div[role="button"]')
  await expect(columns).toHaveCount(3)
  const messagesBeforeHumanMove = gameStateMessages.length
  await columns.first().click()
  await expect(columns).toHaveCount(0)
  await expect(columns).toHaveCount(3)
  await expect
    .poll(() => gameStateMessages.length)
    .toBeGreaterThan(messagesBeforeHumanMove + 1)

  for (const [index, message] of gameStateMessages.entries()) {
    expect(message).toMatchObject({
      type: 'game.state',
      version: 1,
      requestId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      ),
      payload: {
        roomKey: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
        ),
        gameState: { boType: 1 }
      }
    })
    if (index > 0) {
      const gameState = (message.payload as Record<string, unknown>)
        .gameState as Record<string, unknown>
      const previousGameState = (
        gameStateMessages[index - 1].payload as Record<string, unknown>
      ).gameState as Record<string, unknown>

      expect(gameState.revision).toBeGreaterThan(
        previousGameState.revision as number
      )
    }
  }

  const messagesBeforeReload = gameStateMessages.length
  const latestMessage = gameStateMessages.at(-1)!
  const revisionBeforeReload = (
    (latestMessage.payload as Record<string, unknown>).gameState as Record<
      string,
      unknown
    >
  ).revision

  await page.reload()
  await expect(page.getByText('Round 1 of 1')).toBeVisible()
  await expect(columns).toHaveCount(3)
  await expect
    .poll(() => gameStateMessages.length)
    .toBeGreaterThan(messagesBeforeReload)
  await page.waitForTimeout(500)

  for (const message of gameStateMessages.slice(messagesBeforeReload)) {
    const gameState = (message.payload as Record<string, unknown>)
      .gameState as Record<string, unknown>
    expect(gameState.revision).toBe(revisionBeforeReload)
  }
})

test('synchronizes a human game across independent browser identities', async ({
  browser
}) => {
  const firstContext = await browser.newContext()
  const secondContext = await browser.newContext()
  const firstPlayer = await firstContext.newPage()
  const secondPlayer = await secondContext.newPage()

  try {
    await waitForHome(firstPlayer)
    await chooseGame(firstPlayer, 'Play against someone')
    await firstPlayer.getByRole('link', { name: 'Start game' }).click()
    const roomUrl = firstPlayer.url()

    await secondPlayer.goto(roomUrl)
    await expect(
      firstPlayer.getByText('Waiting for game to start...')
    ).toHaveCount(0)
    await expect(
      secondPlayer.getByText('Waiting for game to start...')
    ).toHaveCount(0)

    const firstIdentity = await readIdentity(firstPlayer)
    await firstPlayer.reload()
    await expect(
      firstPlayer.getByText('Waiting for game to start...')
    ).toHaveCount(0)
    expect(await readIdentity(firstPlayer)).toEqual(firstIdentity)

    const firstColumns = firstPlayer.locator('div[role="button"]')
    const secondColumns = secondPlayer.locator('div[role="button"]')
    await expect
      .poll(
        async () => (await firstColumns.count()) + (await secondColumns.count())
      )
      .toBe(3)

    const currentPlayer =
      (await firstColumns.count()) === 3 ? firstPlayer : secondPlayer
    const nextPlayer =
      currentPlayer === firstPlayer ? secondPlayer : firstPlayer
    const currentColumns = currentPlayer.locator('div[role="button"]')
    await expect
      .poll(async () => {
        if ((await currentColumns.count()) === 3) {
          await currentColumns.first().dispatchEvent('click')
        }
        return await currentColumns.count()
      })
      .toBe(0)
    await expect(nextPlayer.locator('div[role="button"]')).toHaveCount(3)
  } finally {
    await firstContext.close()
    await secondContext.close()
  }
})

test('matches two ranked identities and starts their assigned BO1 room', async ({
  browser
}) => {
  const firstContext = await browser.newContext()
  const secondContext = await browser.newContext()
  const firstPlayer = await firstContext.newPage()
  const secondPlayer = await secondContext.newPage()

  try {
    await Promise.all([waitForHome(firstPlayer), waitForHome(secondPlayer)])
    await Promise.all([
      firstPlayer.getByRole('link', { name: 'Play ranked' }).click(),
      secondPlayer.getByRole('link', { name: 'Play ranked' }).click()
    ])

    await Promise.all([
      firstPlayer.waitForURL(/\/room\/[0-9a-f-]+$/),
      secondPlayer.waitForURL(/\/room\/[0-9a-f-]+$/)
    ])
    expect(new URL(firstPlayer.url()).pathname).toBe(
      new URL(secondPlayer.url()).pathname
    )

    for (const player of [firstPlayer, secondPlayer]) {
      await expect(player.getByText('Round 1 of 1')).toBeVisible()
      await expect(
        player.getByText('Waiting for game to start...')
      ).toHaveCount(0)
    }

    const firstColumns = firstPlayer.locator('div[role="button"]')
    const secondColumns = secondPlayer.locator('div[role="button"]')
    await expect
      .poll(
        async () => (await firstColumns.count()) + (await secondColumns.count())
      )
      .toBe(3)

    const currentPlayer =
      (await firstColumns.count()) === 3 ? firstPlayer : secondPlayer
    const nextPlayer =
      currentPlayer === firstPlayer ? secondPlayer : firstPlayer
    await currentPlayer.locator('div[role="button"]').first().click()
    await expect(currentPlayer.locator('div[role="button"]')).toHaveCount(0)
    await expect(nextPlayer.locator('div[role="button"]')).toHaveCount(3)
  } finally {
    await firstContext.close()
    await secondContext.close()
  }
})

test('keeps a spectator read-only while synchronizing a human move', async ({
  browser
}) => {
  const firstContext = await browser.newContext()
  const secondContext = await browser.newContext()
  const spectatorContext = await browser.newContext()
  const firstPlayer = await firstContext.newPage()
  const secondPlayer = await secondContext.newPage()
  const spectator = await spectatorContext.newPage()
  const playableColumns = (page: Page) => page.locator('div[role="button"]')

  try {
    await waitForHome(firstPlayer)
    await waitForHome(secondPlayer)
    await waitForHome(spectator)
    await chooseGame(firstPlayer, 'Play against someone')
    await firstPlayer.getByRole('radio', { name: 'Best of 1' }).click()
    await firstPlayer.getByRole('link', { name: 'Start game' }).click()
    const roomUrl = firstPlayer.url()

    await secondPlayer.goto(roomUrl)
    for (const page of [firstPlayer, secondPlayer]) {
      await expect(page.getByText('Waiting for game to start...')).toHaveCount(
        0
      )
      await expect(page.getByText('Round 1 of 1')).toBeVisible()
    }

    await spectator.goto(roomUrl)
    await expect(
      spectator.getByText('Waiting for game to start...')
    ).toHaveCount(0)
    await expect(spectator.getByText('Round 1 of 1')).toBeVisible()
    await expect(playableColumns(spectator)).toHaveCount(0)

    await expect
      .poll(
        async () =>
          (await playableColumns(firstPlayer).count()) +
          (await playableColumns(secondPlayer).count())
      )
      .toBe(3)

    const currentPlayer =
      (await playableColumns(firstPlayer).count()) === 3
        ? firstPlayer
        : secondPlayer
    const nextPlayer =
      currentPlayer === firstPlayer ? secondPlayer : firstPlayer
    await playableColumns(currentPlayer).first().dispatchEvent('click')

    await expect(playableColumns(currentPlayer)).toHaveCount(0)
    await expect(playableColumns(nextPlayer)).toHaveCount(3)
    await expect(playableColumns(spectator)).toHaveCount(0)
    await expect(spectator.getByText(/^Total: [1-6]$/)).toBeVisible()
  } finally {
    await firstContext.close()
    await secondContext.close()
    await spectatorContext.close()
  }
})

test('keeps the same identity and home route across language changes', async ({
  page
}) => {
  await waitForHome(page)
  const identity = await readIdentity(page)

  await page.getByRole('link', { name: 'English' }).click()
  await expect(
    page.getByRole('button', { name: 'Jouer contre une IA' })
  ).toBeVisible()
  await expect(page).toHaveURL(/\/fr\/$/)
  expect(await readIdentity(page)).toEqual(identity)

  await page.getByRole('link', { name: 'Français' }).click()
  await expect(
    page.getByRole('button', { name: 'Play against an AI' })
  ).toBeVisible()
  await expect(page).toHaveURL(/\/en\/$/)
  expect(await readIdentity(page)).toEqual(identity)
  await expect(page.getByText('Waiting for game to start...')).toHaveCount(0)
})

test('transfers an identity between independent browsers', async ({
  browser
}) => {
  const sourceContext = await browser.newContext()
  const targetContext = await browser.newContext()
  const replayContext = await browser.newContext()
  const source = await sourceContext.newPage()
  const target = await targetContext.newPage()
  const replay = await replayContext.newPage()

  try {
    await waitForHome(source)
    const sourceIdentity = await readIdentity(source)
    await source.getByRole('button', { name: 'Transfer identity' }).click()
    await source.getByRole('button', { name: 'Show code' }).click()
    await expect(
      source.getByLabel('Player identity transfer code')
    ).toHaveValue(/^knucklebones-transfer-v1\./)
    const transferCode = await source
      .getByLabel('Player identity transfer code')
      .inputValue()

    await waitForHome(target)
    await target.getByRole('button', { name: 'Transfer identity' }).click()
    await target.getByPlaceholder('Paste a transfer code').fill(transferCode)
    await Promise.all([
      target.waitForEvent('load'),
      target.getByRole('button', { name: 'Use this identity' }).click()
    ])
    await expect(
      target.getByRole('button', { name: 'Play against an AI' })
    ).toBeVisible()

    const targetIdentity = await readIdentity(target)
    expect(targetIdentity.playerId).toBe(sourceIdentity.playerId)
    expect(targetIdentity.playerCredential).not.toBe(
      sourceIdentity.playerCredential
    )

    await waitForHome(replay)
    await replay.getByRole('button', { name: 'Transfer identity' }).click()
    await replay.getByPlaceholder('Paste a transfer code').fill(transferCode)
    await replay.getByRole('button', { name: 'Use this identity' }).click()
    await expect(replay.getByRole('alert')).toContainText(
      'expired, was already used, or is invalid'
    )
  } finally {
    await sourceContext.close()
    await targetContext.close()
    await replayContext.close()
  }
})

test('recovers an identity once and rotates its recovery phrase', async ({
  browser
}) => {
  const sourceContext = await browser.newContext()
  const targetContext = await browser.newContext()
  const replayContext = await browser.newContext()
  const source = await sourceContext.newPage()
  const target = await targetContext.newPage()
  const replay = await replayContext.newPage()

  try {
    await waitForHome(source)
    const sourceIdentity = await readIdentity(source)
    await source.getByRole('button', { name: 'Transfer identity' }).click()
    await source
      .getByRole('button', { name: 'Create a recovery phrase' })
      .click()
    await expect(
      source.getByLabel('Player identity recovery phrase')
    ).toHaveValue(/^knucklebones-recovery-v1\./)
    const recoveryPhrase = await source
      .getByLabel('Player identity recovery phrase')
      .inputValue()

    await waitForHome(target)
    await target.getByRole('button', { name: 'Transfer identity' }).click()
    await target
      .getByPlaceholder('Paste a recovery phrase')
      .fill(recoveryPhrase)
    await Promise.all([
      target.waitForEvent('load'),
      target.getByRole('button', { name: 'Recover this identity' }).click()
    ])
    await expect(
      target.getByLabel('Player identity recovery phrase')
    ).toHaveValue(/^knucklebones-recovery-v1\./)
    const targetIdentity = await readIdentity(target)
    expect(targetIdentity.playerId).toBe(sourceIdentity.playerId)
    expect(targetIdentity.playerCredential).not.toBe(
      sourceIdentity.playerCredential
    )

    await waitForHome(replay)
    await replay.getByRole('button', { name: 'Transfer identity' }).click()
    await replay
      .getByPlaceholder('Paste a recovery phrase')
      .fill(recoveryPhrase)
    await replay.getByRole('button', { name: 'Recover this identity' }).click()
    await expect(replay.getByRole('alert')).toContainText(
      'invalid or has already been replaced'
    )
  } finally {
    await sourceContext.close()
    await targetContext.close()
    await replayContext.close()
  }
})
