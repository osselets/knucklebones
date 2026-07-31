import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { QrCodeIcon, LinkIcon } from '@heroicons/react/24/outline'
import { QRCodeSVG } from 'qrcode.react'
import { Button } from './Button'
import { Modal } from './Modal'
import { ShortcutModal } from './ShortcutModal'

interface QRCodeBaseProps {
  title: React.ReactNode
}

function QRCodeBase({ title }: QRCodeBaseProps) {
  const [copied, setCopied] = React.useState(false)
  const copiedTimeout = React.useRef<ReturnType<typeof setTimeout>>(undefined)
  const { t } = useTranslation()

  React.useEffect(() => {
    return () => {
      clearTimeout(copiedTimeout.current)
    }
  }, [])

  async function copyUrl() {
    await navigator.clipboard.writeText(window.location.href)
    setCopied(true)

    clearTimeout(copiedTimeout.current)
    copiedTimeout.current = setTimeout(() => {
      setCopied(false)
    }, 750)
  }

  return (
    <>
      {title}
      <div className='flex flex-col items-center justify-center gap-6'>
        <div className='rounded-lg border-2 border-slate-200 bg-slate-50 p-2 dark:border-0'>
          <QRCodeSVG value={window.location.href} />
        </div>
        <Button
          className='flex flex-row items-center gap-2 text-lg'
          leftIcon={copied ? undefined : <LinkIcon />}
          onClick={() => {
            void copyUrl()
          }}
        >
          {t(copied ? 'menu.share.copied' : 'menu.share.copy')}
        </Button>
      </div>
    </>
  )
}

export function QRCode() {
  const { t } = useTranslation()
  return (
    <QRCodeBase
      title={
        <h3 className='text-center text-xl font-medium'>
          {t('menu.share.title')}
        </h3>
      }
    />
  )
}

export function QRCodeModal() {
  const { t } = useTranslation()
  return (
    <ShortcutModal icon={<QrCodeIcon />} label={t('menu.share.label')}>
      <QRCodeBase title={<Modal.Title>{t('menu.share.title')}</Modal.Title>} />
    </ShortcutModal>
  )
}
