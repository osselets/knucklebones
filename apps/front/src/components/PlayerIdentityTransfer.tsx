import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
  ClipboardDocumentIcon,
  EyeIcon,
  EyeSlashIcon,
  IdentificationIcon
} from '@heroicons/react/24/outline'
import {
  createPlayerTransferCode,
  parsePlayerTransferCode
} from '@knucklebones/common'
import { verifyPlayer } from '../utils/api'
import {
  getStoredPlayerCredentials,
  storePlayerCredentials
} from '../utils/playerIdentity'
import { Button } from './Button'
import { Modal } from './Modal'
import { ShortcutModal } from './ShortcutModal'

export function PlayerIdentityTransfer() {
  const { t } = useTranslation()
  const credentials = getStoredPlayerCredentials()!
  const transferCode = createPlayerTransferCode(credentials)
  const [copied, setCopied] = React.useState(false)
  const [isCodeVisible, setIsCodeVisible] = React.useState(false)
  const [importCode, setImportCode] = React.useState('')
  const [importError, setImportError] = React.useState<string>()
  const [isImporting, setIsImporting] = React.useState(false)
  const copiedTimeout = React.useRef<ReturnType<typeof setTimeout>>(undefined)

  React.useEffect(() => {
    return () => {
      clearTimeout(copiedTimeout.current)
    }
  }, [])

  async function copyTransferCode() {
    await navigator.clipboard.writeText(transferCode)
    setCopied(true)

    clearTimeout(copiedTimeout.current)
    copiedTimeout.current = setTimeout(() => {
      setCopied(false)
    }, 750)
  }

  async function importPlayerIdentity() {
    const importedCredentials = parsePlayerTransferCode(importCode)

    if (importedCredentials === undefined) {
      setImportError(t('identity.transfer.invalid'))
      return
    }

    setImportError(undefined)
    setIsImporting(true)

    try {
      await verifyPlayer(importedCredentials)
      storePlayerCredentials(importedCredentials)
      window.location.reload()
    } catch {
      setImportError(t('identity.transfer.error'))
      setIsImporting(false)
    }
  }

  return (
    <ShortcutModal
      icon={<IdentificationIcon />}
      label={t('identity.transfer.label')}
    >
      <div className='flex max-w-lg flex-col gap-6'>
        <Modal.Title>{t('identity.transfer.title')}</Modal.Title>
        <div className='flex flex-col gap-2'>
          <p>{t('identity.transfer.warning')}</p>
          <p className='font-semibold text-amber-700 dark:text-amber-400'>
            {t('identity.transfer.secret-warning')}
          </p>
        </div>

        <section className='flex flex-col gap-3'>
          <h3 className='text-lg font-semibold'>
            {t('identity.transfer.export-title')}
          </h3>
          <input
            type={isCodeVisible ? 'text' : 'password'}
            value={transferCode}
            readOnly
            spellCheck={false}
            aria-label={t('identity.transfer.code-label')}
            className='rounded-md border-2 border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-600 dark:bg-slate-800'
          />
          <div className='flex flex-wrap gap-2'>
            <Button
              leftIcon={<ClipboardDocumentIcon />}
              onClick={() => void copyTransferCode()}
            >
              {t(
                copied ? 'identity.transfer.copied' : 'identity.transfer.copy'
              )}
            </Button>
            <Button
              variant='secondary'
              leftIcon={isCodeVisible ? <EyeSlashIcon /> : <EyeIcon />}
              onClick={() => setIsCodeVisible((visible) => !visible)}
            >
              {t(
                isCodeVisible
                  ? 'identity.transfer.hide'
                  : 'identity.transfer.show'
              )}
            </Button>
          </div>
        </section>

        <section className='flex flex-col gap-3 border-t-2 border-slate-200 pt-6 dark:border-slate-700'>
          <h3 className='text-lg font-semibold'>
            {t('identity.transfer.import-title')}
          </h3>
          <p>{t('identity.transfer.import-warning')}</p>
          <textarea
            value={importCode}
            onChange={(event) => setImportCode(event.target.value)}
            placeholder={t('identity.transfer.import-placeholder')}
            spellCheck={false}
            rows={3}
            className='resize-none rounded-md border-2 border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-600 dark:bg-slate-800'
          />
          {importError !== undefined && (
            <p role='alert' className='text-red-700 dark:text-red-400'>
              {importError}
            </p>
          )}
          <Button
            disabled={isImporting || importCode.trim() === ''}
            onClick={() => void importPlayerIdentity()}
          >
            {t('identity.transfer.import')}
          </Button>
        </section>
      </div>
    </ShortcutModal>
  )
}
