import { expect, test, type Page } from '@playwright/test'

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
}

async function readIdentity(page: Page): Promise<StoredIdentity> {
  return await page.evaluate(() => ({
    displayName: localStorage.displayName,
    playerCredential: localStorage.playerCredential,
    playerId: localStorage.playerId
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
  expect(originalIdentity.playerCredential).toMatch(/^[0-9a-f]{64}$/)
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
    await currentPlayer.locator('div[role="button"]').first().click()

    await expect(currentPlayer.locator('div[role="button"]')).toHaveCount(0)
    await expect(nextPlayer.locator('div[role="button"]')).toHaveCount(3)
  } finally {
    await firstContext.close()
    await secondContext.close()
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
  const source = await sourceContext.newPage()
  const target = await targetContext.newPage()

  try {
    await waitForHome(source)
    const sourceIdentity = await readIdentity(source)
    await source.getByRole('button', { name: 'Transfer identity' }).click()
    await source.getByRole('button', { name: 'Show code' }).click()
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

    expect((await readIdentity(target)).playerId).toBe(sourceIdentity.playerId)
  } finally {
    await sourceContext.close()
    await targetContext.close()
  }
})
