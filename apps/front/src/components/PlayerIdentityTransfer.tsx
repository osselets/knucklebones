import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
  ClipboardDocumentIcon,
  EyeIcon,
  EyeSlashIcon,
  IdentificationIcon
} from '@heroicons/react/24/outline'
import { QRCodeSVG } from 'qrcode.react'
import {
  createIdentityTransferCode,
  parseIdentityTransferCode,
  recoveryPhraseSchema
} from '@knucklebones/common'
import {
  createIdentityTransfer,
  redeemIdentityRecovery,
  redeemIdentityTransfer,
  rotateIdentityRecovery
} from '../utils/api'
import {
  getPendingRecoveryPhrase,
  storePendingRecoveryPhrase,
  storePlayerCredentials
} from '../utils/playerIdentity'
import { Button } from './Button'
import { Modal } from './Modal'
import { ShortcutModal } from './ShortcutModal'

export function PlayerIdentityTransfer() {
  const { t } = useTranslation()
  const [transferCode, setTransferCode] = React.useState('')
  const [copied, setCopied] = React.useState(false)
  const [isCodeVisible, setIsCodeVisible] = React.useState(false)
  const [isExporting, setIsExporting] = React.useState(false)
  const [exportError, setExportError] = React.useState<string>()
  const [importCode, setImportCode] = React.useState('')
  const [importError, setImportError] = React.useState<string>()
  const [isImporting, setIsImporting] = React.useState(false)
  const [revokeOtherDevicesOnTransfer, setRevokeOtherDevicesOnTransfer] =
    React.useState(false)
  const [recoveryPhrase, setRecoveryPhrase] = React.useState(
    getPendingRecoveryPhrase
  )
  const [isRecoveryVisible, setIsRecoveryVisible] = React.useState(
    recoveryPhrase !== undefined
  )
  const [recoveryInput, setRecoveryInput] = React.useState('')
  const [recoveryError, setRecoveryError] = React.useState<string>()
  const [isRotatingRecovery, setIsRotatingRecovery] = React.useState(false)
  const [isRecovering, setIsRecovering] = React.useState(false)
  const [revokeOtherDevicesOnRecovery, setRevokeOtherDevicesOnRecovery] =
    React.useState(false)
  const copiedTimeout = React.useRef<ReturnType<typeof setTimeout>>(undefined)

  React.useEffect(() => {
    return () => {
      clearTimeout(copiedTimeout.current)
    }
  }, [])

  async function issueTransferCode(): Promise<string | undefined> {
    setIsExporting(true)

    try {
      setExportError(undefined)
      const transfer = await createIdentityTransfer()
      const code = createIdentityTransferCode(transfer.transferToken)
      setTransferCode(code)
      return code
    } catch {
      setExportError(t('identity.transfer.create-error'))
      return undefined
    } finally {
      setIsExporting(false)
    }
  }

  async function copyTransferCode() {
    const code = transferCode || (await issueTransferCode())
    if (code === undefined) {
      return
    }

    await navigator.clipboard.writeText(code)
    setCopied(true)

    clearTimeout(copiedTimeout.current)
    copiedTimeout.current = setTimeout(() => {
      setCopied(false)
    }, 750)
  }

  async function toggleTransferCode() {
    if (isCodeVisible) {
      setIsCodeVisible(false)
      return
    }

    if (transferCode === '' && (await issueTransferCode()) === undefined) {
      return
    }

    setIsCodeVisible(true)
  }

  async function importPlayerIdentity() {
    const transferToken = parseIdentityTransferCode(importCode)

    if (transferToken === undefined) {
      setImportError(t('identity.transfer.invalid'))
      return
    }

    setImportError(undefined)
    setIsImporting(true)

    try {
      const importedCredentials = await redeemIdentityTransfer(
        transferToken,
        revokeOtherDevicesOnTransfer
      )
      storePlayerCredentials(importedCredentials)
      window.location.reload()
    } catch {
      setImportError(t('identity.transfer.error'))
      setIsImporting(false)
    }
  }

  async function rotateRecoveryPhrase() {
    setRecoveryError(undefined)
    setIsRotatingRecovery(true)

    try {
      const recovery = await rotateIdentityRecovery()
      storePendingRecoveryPhrase(recovery.recoveryPhrase)
      setRecoveryPhrase(recovery.recoveryPhrase)
      setIsRecoveryVisible(true)
    } catch {
      setRecoveryError(t('identity.recovery.rotate-error'))
    } finally {
      setIsRotatingRecovery(false)
    }
  }

  async function copyRecoveryPhrase() {
    if (recoveryPhrase !== undefined) {
      await navigator.clipboard.writeText(recoveryPhrase)
    }
  }

  async function recoverPlayerIdentity() {
    const normalizedPhrase = recoveryInput.trim().toLowerCase()
    if (!recoveryPhraseSchema.safeParse(normalizedPhrase).success) {
      setRecoveryError(t('identity.recovery.invalid'))
      return
    }

    setRecoveryError(undefined)
    setIsRecovering(true)

    try {
      const recovered = await redeemIdentityRecovery(
        normalizedPhrase,
        revokeOtherDevicesOnRecovery
      )
      storePlayerCredentials(recovered)
      storePendingRecoveryPhrase(recovered.recoveryPhrase)
      window.location.reload()
    } catch {
      setRecoveryError(t('identity.recovery.error'))
      setIsRecovering(false)
    }
  }

  return (
    <ShortcutModal
      icon={<IdentificationIcon />}
      label={t('identity.transfer.label')}
      onOpen={() => {
        if (transferCode === '') void issueTransferCode()
      }}
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
          {isCodeVisible && transferCode !== '' && (
            <div className='flex flex-col items-center gap-2'>
              <div
                role='img'
                aria-label={t('identity.transfer.qr-label')}
                className='rounded-lg border-2 border-slate-200 bg-white p-3'
              >
                <QRCodeSVG value={transferCode} size={192} />
              </div>
              <p className='text-center text-sm text-slate-600 dark:text-slate-300'>
                {t('identity.transfer.qr-description')}
              </p>
            </div>
          )}
          <div className='flex flex-wrap gap-2'>
            <Button
              disabled={isExporting}
              leftIcon={<ClipboardDocumentIcon />}
              onClick={() => void copyTransferCode()}
            >
              {t(
                copied ? 'identity.transfer.copied' : 'identity.transfer.copy'
              )}
            </Button>
            <Button
              disabled={isExporting}
              variant='secondary'
              leftIcon={isCodeVisible ? <EyeSlashIcon /> : <EyeIcon />}
              onClick={() => void toggleTransferCode()}
            >
              {t(
                isCodeVisible
                  ? 'identity.transfer.hide'
                  : 'identity.transfer.show'
              )}
            </Button>
          </div>
          <p className='text-sm text-slate-600 dark:text-slate-300'>
            {t('identity.transfer.expiry')}
          </p>
          {exportError !== undefined && (
            <p role='alert' className='text-red-700 dark:text-red-400'>
              {exportError}
            </p>
          )}
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
          <label className='flex cursor-pointer items-start gap-2'>
            <input
              type='checkbox'
              className='mx-0 mt-1 size-4 shrink-0 cursor-pointer'
              checked={revokeOtherDevicesOnTransfer}
              onChange={(event) =>
                setRevokeOtherDevicesOnTransfer(event.target.checked)
              }
            />
            <span>{t('identity.transfer.revoke-others')}</span>
          </label>
          <Button
            disabled={isImporting || importCode.trim() === ''}
            onClick={() => void importPlayerIdentity()}
          >
            {t('identity.transfer.import')}
          </Button>
        </section>

        <section className='flex flex-col gap-3 border-t-2 border-slate-200 pt-6 dark:border-slate-700'>
          <h3 className='text-lg font-semibold'>
            {t('identity.recovery.title')}
          </h3>
          <p>{t('identity.recovery.warning')}</p>
          {recoveryPhrase !== undefined && (
            <>
              <input
                type={isRecoveryVisible ? 'text' : 'password'}
                value={recoveryPhrase}
                readOnly
                spellCheck={false}
                aria-label={t('identity.recovery.phrase-label')}
                className='rounded-md border-2 border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-600 dark:bg-slate-800'
              />
              <div className='flex flex-wrap gap-2'>
                <Button onClick={() => void copyRecoveryPhrase()}>
                  {t('identity.recovery.copy')}
                </Button>
                <Button
                  variant='secondary'
                  onClick={() => setIsRecoveryVisible((visible) => !visible)}
                >
                  {t(
                    isRecoveryVisible
                      ? 'identity.recovery.hide'
                      : 'identity.recovery.show'
                  )}
                </Button>
              </div>
            </>
          )}
          {recoveryPhrase === undefined && (
            <Button
              disabled={isRotatingRecovery}
              onClick={() => void rotateRecoveryPhrase()}
            >
              {t('identity.recovery.generate')}
            </Button>
          )}

          <h4 className='font-semibold'>{t('identity.recovery.use-title')}</h4>
          <textarea
            value={recoveryInput}
            onChange={(event) => setRecoveryInput(event.target.value)}
            placeholder={t('identity.recovery.placeholder')}
            spellCheck={false}
            rows={3}
            className='resize-none rounded-md border-2 border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-600 dark:bg-slate-800'
          />
          <label className='flex cursor-pointer items-start gap-2'>
            <input
              type='checkbox'
              className='mx-0 mt-1 size-4 shrink-0 cursor-pointer'
              checked={revokeOtherDevicesOnRecovery}
              onChange={(event) =>
                setRevokeOtherDevicesOnRecovery(event.target.checked)
              }
            />
            <span>{t('identity.recovery.revoke-others')}</span>
          </label>
          {recoveryError !== undefined && (
            <p role='alert' className='text-red-700 dark:text-red-400'>
              {recoveryError}
            </p>
          )}
          <Button
            disabled={isRecovering || recoveryInput.trim() === ''}
            onClick={() => void recoverPlayerIdentity()}
          >
            {t('identity.recovery.use')}
          </Button>
        </section>
      </div>
    </ShortcutModal>
  )
}
