import grassLaneImg from '../../assets/scalerush/kenney/grass-lane.png'
import waterLaneImg from '../../assets/scalerush/kenney/water-lane.png'
import roadLaneImg from '../../assets/scalerush/kenney/road-lane.png'
import logImg from '../../assets/scalerush/kenney/log.png'
import rockImg from '../../assets/scalerush/kenney/rock.png'
import crateImg from '../../assets/scalerush/kenney/crate.png'
import trumpetPlayerImg from '../../assets/scalerush/trumpet-player.png'

export const SCALE_RUSH_ASSETS = {
  grassLane: grassLaneImg,
  grassPath: grassLaneImg,
  waterLane: waterLaneImg,
  roadLane: roadLaneImg,
  log: logImg,
  rock: rockImg,
  crate: crateImg,
  trumpetPlayer: trumpetPlayerImg,
  /** @deprecated Legacy React course — use grassLane */
  grass: grassLaneImg,
  /** @deprecated Legacy React course — use waterLane */
  water: waterLaneImg,
} as const
