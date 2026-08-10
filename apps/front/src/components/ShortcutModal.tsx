import * as React from 'react'
import { Button } from './Button'
import { Modal } from './Modal'

interface ShortcutProps {
  icon?: React.ReactNode
  label?: React.ReactNode
}

interface ShortcutActionProps {
  onClick(): void
}

interface ToolbarModalProps extends ShortcutProps {
  isInitiallyOpen?: boolean
  onOpen?(): void
  renderTrigger?(args: ShortcutActionProps): React.ReactNode
}

// Idée : Utiliser l'URL pour gérer le state d'ouverture d'une modale
// Avantages :
// - Persiste l'état de l'application dans l'URL (se garde après un refresh)
// - Déclaration des modales sans besoin de shortcut et redéclaration de state
export function ShortcutModal({
  icon,
  label,
  children,
  renderTrigger = ({ onClick }) => (
    <Button variant='ghost' leftIcon={icon} onClick={onClick}>
      {label}
    </Button>
  ),
  isInitiallyOpen = false,
  onOpen
}: React.PropsWithChildren<ToolbarModalProps>) {
  const [isModalOpen, setIsModalOpen] = React.useState(isInitiallyOpen)

  function openModal() {
    setIsModalOpen(true)
    onOpen?.()
  }

  return (
    <div className='flex items-center'>
      {renderTrigger({ onClick: openModal })}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
        }}
      >
        {children}
      </Modal>
    </div>
  )
}
