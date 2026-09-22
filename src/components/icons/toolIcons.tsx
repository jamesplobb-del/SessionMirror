import { AudioLines, FileMusic, LayoutGrid, MicVocal, Radio } from 'lucide-react'
import MetronomeIcon from './MetronomeIcon'

/**
 * One glyph per practice tool, used everywhere that tool appears — the
 * Workspace tray, the music page's tool row, and the tool's own ball. A player
 * who turns on "Drone" should find the same picture waiting on the edge.
 */
export const PitchToolIcon = AudioLines
export const DroneToolIcon = Radio
export const TakesToolIcon = LayoutGrid
export const HandsFreeToolIcon = MicVocal
export const MusicToolIcon = FileMusic
export const MetronomeToolIcon = MetronomeIcon
