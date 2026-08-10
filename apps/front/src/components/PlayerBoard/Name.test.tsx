import * as React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Name } from './Name'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

describe('Name', () => {
  it('generates a friendly replacement instead of exposing the UUID', async () => {
    const updateDisplayName = vi.fn()
    const playerId = '22222222-2222-4222-8222-222222222222'

    render(
      <Name
        id={playerId}
        displayName='Custom Name'
        isPlayerOne
        isEditable
        updateDisplayName={updateDisplayName}
      />
    )

    await userEvent.click(screen.getByRole('button'))
    const input = screen.getByRole('textbox')
    await userEvent.clear(input)
    await userEvent.keyboard('{Enter}')

    expect(updateDisplayName).toHaveBeenCalledOnce()
    const generatedName = updateDisplayName.mock.calls[0][0] as string
    expect(generatedName).not.toBe(playerId)
    expect(generatedName).toMatch(/^[A-Z][A-Za-z]+$/)
    expect(localStorage.getItem('knucklebones.identity.v1.displayName')).toBe(
      generatedName
    )
    expect(screen.getByText(new RegExp(generatedName))).toBeInTheDocument()
  })
})
