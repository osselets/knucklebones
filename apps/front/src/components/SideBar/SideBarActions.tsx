import * as React from 'react'
import * as ReactDOM from 'react-dom'

export const SIDE_BAR_ACTION_CONTAINER = 'side-bar-action-container'

export function SideBarActionContainer({ children }: React.PropsWithChildren) {
  return (
    <div
      id={SIDE_BAR_ACTION_CONTAINER}
      className='flex flex-col items-start gap-4'
    >
      {children}
    </div>
  )
}

export function SideBarActions({ children }: React.PropsWithChildren) {
  const [sideBarActionContainer, setSideBarActionContainer] =
    React.useState<Element>()

  React.useLayoutEffect(() => {
    const quickActionsNode = document.querySelector(
      `#${SIDE_BAR_ACTION_CONTAINER}`
    )
    if (sideBarActionContainer === undefined && quickActionsNode !== null) {
      setSideBarActionContainer(quickActionsNode)
    }
  }, [sideBarActionContainer])

  if (sideBarActionContainer === undefined) {
    return null
  }

  return ReactDOM.createPortal(children, sideBarActionContainer)
}
