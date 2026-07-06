import {
  ArrowDown,
  ArrowUp,
  Crop,
  Eye,
  EyeOff,
  Layers,
  Pencil,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import Pressable from '../ui/Pressable'
import type { StudioCanvasObject } from '../../creatorStudio/types'

interface ContextAction {
  id: string
  label: string
  icon: LucideIcon
  onClick: () => void
  destructive?: boolean
}

interface CreatorStudioContextBarProps {
  selectedObject: StudioCanvasObject | null
  onEditText: () => void
  onToggleWatermark: () => void
  onToggleSheetMode: () => void
  onReplaceSheet: () => void
  onCropRecording: () => void
  onBringForward: () => void
  onSendBackward: () => void
  onDelete: () => void
}

export default function CreatorStudioContextBar({
  selectedObject,
  onEditText,
  onToggleWatermark,
  onToggleSheetMode,
  onReplaceSheet,
  onCropRecording,
  onBringForward,
  onSendBackward,
  onDelete,
}: CreatorStudioContextBarProps) {
  if (!selectedObject) return null

  const actions: ContextAction[] = []

  if (selectedObject.kind === 'recording') {
    actions.push({ id: 'crop', label: 'Crop', icon: Crop, onClick: onCropRecording })
  }

  if (selectedObject.kind === 'sheetMusic') {
    actions.push({
      id: 'mode',
      label: selectedObject.displayMode === 'overlay' ? 'Separate' : 'Overlay',
      icon: Layers,
      onClick: onToggleSheetMode,
    })
    actions.push({ id: 'replace', label: 'Replace', icon: Pencil, onClick: onReplaceSheet })
  }

  if (selectedObject.kind === 'text') {
    actions.push({ id: 'edit', label: 'Edit', icon: Pencil, onClick: onEditText })
  }

  if (selectedObject.kind === 'watermark') {
    actions.push({
      id: 'toggle',
      label: selectedObject.visible ? 'Hide' : 'Show',
      icon: selectedObject.visible ? EyeOff : Eye,
      onClick: onToggleWatermark,
    })
  }

  if (selectedObject.kind !== 'recording') {
    actions.push({ id: 'forward', label: 'Forward', icon: ArrowUp, onClick: onBringForward })
    actions.push({ id: 'backward', label: 'Back', icon: ArrowDown, onClick: onSendBackward })
    actions.push({ id: 'delete', label: 'Delete', icon: Trash2, onClick: onDelete, destructive: true })
  }

  return (
    <div className="creator-studio__context-bar" role="toolbar" aria-label="Object actions">
      {actions.map((action) => {
        const Icon = action.icon
        return (
          <Pressable
            key={action.id}
            type="button"
            intensity="soft"
            haptic="light"
            className={`creator-studio__context-action ${
              action.destructive ? 'creator-studio__context-action--destructive' : ''
            }`}
            onClick={action.onClick}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{action.label}</span>
          </Pressable>
        )
      })}
    </div>
  )
}
