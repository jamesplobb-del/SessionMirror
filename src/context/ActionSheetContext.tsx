import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import ActionSheet from '../components/ui/ActionSheet'
import {
  triggerErrorHaptic,
  triggerLightHaptic,
  triggerMediumHaptic,
  triggerSuccessHaptic,
  triggerWarningHaptic,
} from '../utils/haptics'

export type ActionSheetTone = 'default' | 'success' | 'error'

export interface AlertOptions {
  message: string
  title?: string
  tone?: ActionSheetTone
  confirmLabel?: string
}

export interface ConfirmOptions {
  message: string
  title?: string
  confirmLabel?: string
  destructive?: boolean
}

type SheetRequest =
  | {
      kind: 'alert'
      message: string
      title?: string
      tone: ActionSheetTone
      confirmLabel: string
      resolve: () => void
    }
  | {
      kind: 'confirm'
      message: string
      title?: string
      confirmLabel: string
      destructive: boolean
      resolve: (confirmed: boolean) => void
    }

interface ActionSheetContextValue {
  showAlert: (options: AlertOptions | string) => Promise<void>
  showConfirm: (options: ConfirmOptions | string) => Promise<boolean>
}

const ActionSheetContext = createContext<ActionSheetContextValue | null>(null)

/**
 * Live provider's showAlert, for callers that cannot use the hook.
 *
 * The provider is mounted *inside* App's render tree, so App itself and the
 * hooks it calls (useCameraSession) are above it and cannot read the context —
 * but they are exactly where recording failures surface. Only one provider is
 * live at a time (RootRouter's for quick tools, App's otherwise).
 */
let liveShowAlert: ActionSheetContextValue['showAlert'] | null = null

/**
 * Show an alert from outside the React tree. No-ops if no provider is mounted,
 * so it is safe during boot and teardown.
 */
export function showAlertOutsideTree(options: AlertOptions | string): void {
  if (!liveShowAlert) {
    console.warn('[ActionSheet] no provider mounted; alert dropped', options)
    return
  }
  void liveShowAlert(options)
}

function playToneHaptic(tone: ActionSheetTone): void {
  if (tone === 'success') {
    triggerSuccessHaptic()
    return
  }
  if (tone === 'error') {
    triggerErrorHaptic()
  }
}

export function ActionSheetProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<SheetRequest | null>(null)
  const requestRef = useRef<SheetRequest | null>(null)

  const dismiss = useCallback(() => {
    setRequest(null)
    requestRef.current = null
  }, [])

  const showAlert = useCallback((options: AlertOptions | string) => {
    const normalized =
      typeof options === 'string'
        ? { message: options }
        : options

    return new Promise<void>((resolve) => {
      const tone = normalized.tone ?? 'default'
      playToneHaptic(tone)

      const next: SheetRequest = {
        kind: 'alert',
        message: normalized.message,
        title: normalized.title,
        tone,
        confirmLabel: normalized.confirmLabel ?? 'OK',
        resolve: () => {
          resolve()
          dismiss()
        },
      }
      requestRef.current = next
      setRequest(next)
    })
  }, [dismiss])

  const showConfirm = useCallback((options: ConfirmOptions | string) => {
    const normalized =
      typeof options === 'string'
        ? { message: options }
        : options

    triggerLightHaptic()

    return new Promise<boolean>((resolve) => {
      const next: SheetRequest = {
        kind: 'confirm',
        message: normalized.message,
        title: normalized.title,
        confirmLabel: normalized.confirmLabel ?? (normalized.destructive ? 'Delete' : 'Confirm'),
        destructive: Boolean(normalized.destructive),
        resolve: (confirmed) => {
          resolve(confirmed)
          dismiss()
        },
      }
      requestRef.current = next
      setRequest(next)
    })
  }, [dismiss])

  const handleCancel = useCallback(() => {
    const current = requestRef.current
    if (!current) return

    triggerLightHaptic()
    if (current.kind === 'confirm') {
      current.resolve(false)
      return
    }
    current.resolve()
  }, [])

  const handleConfirm = useCallback(() => {
    const current = requestRef.current
    if (!current) return

    if (current.kind === 'alert') {
      triggerLightHaptic()
      current.resolve()
      return
    }

    if (current.destructive) {
      triggerWarningHaptic()
    } else {
      triggerMediumHaptic()
    }
    current.resolve(true)
  }, [])

  const value = useMemo(
    () => ({ showAlert, showConfirm }),
    [showAlert, showConfirm],
  )

  useEffect(() => {
    liveShowAlert = showAlert
    return () => {
      if (liveShowAlert === showAlert) liveShowAlert = null
    }
  }, [showAlert])

  return (
    <ActionSheetContext.Provider value={value}>
      {children}
      <ActionSheet
        request={request}
        onCancel={handleCancel}
        onConfirm={handleConfirm}
      />
    </ActionSheetContext.Provider>
  )
}

export function useActionSheet(): ActionSheetContextValue {
  const context = useContext(ActionSheetContext)
  if (!context) {
    throw new Error('useActionSheet must be used within ActionSheetProvider')
  }
  return context
}
