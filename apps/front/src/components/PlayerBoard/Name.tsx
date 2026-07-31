import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
  PencilSquareIcon,
  CheckIcon,
  XMarkIcon
} from '@heroicons/react/24/outline'
import { isEmptyOrBlank } from '@knucklebones/common'
import {
  MAX_NAME_LENGTH,
  type PlayerNameProps,
  getName
} from '../../utils/name'
import { IconButton } from '../IconButton'

interface NameProps extends PlayerNameProps {
  isPlayerOne: boolean
  updateDisplayName?(displayName: string): void
  isEditable: boolean
}

export function Name({
  isPlayerOne,
  updateDisplayName,
  isEditable,
  ...player
}: NameProps) {
  const computedName = getName(player)
  const { id, displayName } = player
  const [isBeingEdited, setIsBeingEdited] = React.useState(false)
  const [name, setName] = React.useState(computedName)
  const { t } = useTranslation()

  React.useEffect(() => {
    setName(computedName)
  }, [computedName])

  function handleOnKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      onDisplayNameSubmit()
    } else if (e.key === 'Escape') {
      onDisplayNameCancel()
    }
  }

  function handleOnChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Avoid players using ridiculously long names
    setName(e.target.value.substring(0, MAX_NAME_LENGTH))
  }

  function handleOnFocus(e: React.FocusEvent<HTMLInputElement, Element>) {
    // Select all input when focused
    e.target.select()
  }

  function onDisplayNameSubmit() {
    setIsBeingEdited(false)

    if (isEmptyOrBlank(name)) {
      // If the name is empty, we want to remove the display name from local storage
      localStorage.removeItem('displayName')

      if (computedName === id) {
        // If the name displayed was equal to id, and the name is now empty
        // default back to id as we don't want an empty name
        setName(id)
      } else {
        // If the name displayed was not the id (so it was the displayName)
        // and the name is now empty, send an empty displayName to the backend
        // as the player is trying to remove their displayName
        updateDisplayName!('')
      }
    } else {
      if (computedName === id) {
        if (name !== id) {
          // If the name displayed was the id, and the new name
          // is different from the id the player is trying to set a
          // displayName, so set it in local storage and send it to the backend
          localStorage.setItem('displayName', name)
          updateDisplayName!(name)
        }
      } else {
        if (name !== displayName) {
          // Same case as above, but the player is trying to update their displayName
          localStorage.setItem('displayName', name)
          updateDisplayName!(name)
        }
      }
    }
  }

  function onDisplayNameCancel() {
    setIsBeingEdited(false)
    setName(computedName)
  }

  function onEditClick() {
    setIsBeingEdited(true)
  }

  if (isBeingEdited) {
    return (
      <div className='flex items-center gap-2'>
        <input
          type='text'
          value={name}
          className='rounded-lg bg-slate-200 p-2 dark:bg-slate-700'
          onChange={handleOnChange}
          onKeyDown={handleOnKeyDown}
          autoFocus
          onFocus={handleOnFocus}
        />
        <IconButton icon={<CheckIcon />} onClick={onDisplayNameSubmit} />
        <IconButton icon={<XMarkIcon />} onClick={onDisplayNameCancel} />
      </div>
    )
  } else {
    return (
      <div className='flex flex-wrap items-center justify-center gap-2'>
        <p className='text-center break-all'>
          {name}
          {isPlayerOne && isEditable && ` (${t('game.you')})`}
        </p>
        {isEditable && (
          <IconButton icon={<PencilSquareIcon />} onClick={onEditClick} />
        )}
      </div>
    )
  }
}
