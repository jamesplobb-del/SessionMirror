import Phaser from 'phaser'
import { SCALE_RUSH_ASSETS } from '../scaleRushAssets'
import { buildCourseRows, type CourseRow } from '../scaleRushMusicLogic'
import type { ScaleRushFeedback } from '../scaleRushTypes'
import { scaleRushPhaserBridgeRef } from './scaleRushPhaserBridge'

const SCENE_KEY = 'ScaleRushWorld'
const VISIBLE_AHEAD = 8

/** Visual lane order — does not affect note logic. */
const LANE_PATTERN = ['grass', 'road', 'grass', 'river', 'grass', 'tracks', 'grass'] as const
type LaneVisual = (typeof LANE_PATTERN)[number]

const FEEDBACK_LABELS = {
  perfect: '★ Perfect!',
  good: 'Good!',
  wrong: 'Wrong note',
  timeout: '⚠ Too late',
} as const

function laneVisualForRow(row: CourseRow): LaneVisual {
  return LANE_PATTERN[row.rowOffset % LANE_PATTERN.length]!
}

type TileVariant = 'ahead' | 'target' | 'landed' | 'start'

interface LaneLayout {
  laneH: number
  tileW: number
  charH: number
  centerX: number
  playerLaneY: number
}

export class ScaleRushPhaserScene extends Phaser.Scene {
  private worldRoot!: Phaser.GameObjects.Container
  private lanesRoot!: Phaser.GameObjects.Container
  private playerLaneRoot!: Phaser.GameObjects.Container
  private playerSprite!: Phaser.GameObjects.Image
  private playerShadow!: Phaser.GameObjects.Ellipse
  private feedbackText!: Phaser.GameObjects.Text
  private skyGfx!: Phaser.GameObjects.Graphics

  private lastAdvanceToken = 0
  private lastMissToken = 0
  private lastFeedbackToken = 0
  private lastSequenceStep = -1
  private scrollPixels = 0
  private scrollTarget = 0
  private isHopping = false
  private idleTween: Phaser.Tweens.Tween | null = null
  private layout!: LaneLayout

  constructor() {
    super(SCENE_KEY)
  }

  preload() {
    this.load.image('sr-grass', SCALE_RUSH_ASSETS.grass)
    this.load.image('sr-water', SCALE_RUSH_ASSETS.water)
    this.load.image('sr-player', SCALE_RUSH_ASSETS.trumpetPlayer)
  }

  create() {
    this.cameras.main.setBackgroundColor('#2d8a3e')

    this.skyGfx = this.add.graphics().setDepth(0)
    this.worldRoot = this.add.container(0, 0).setDepth(10)
    this.lanesRoot = this.add.container(0, 0)
    this.playerLaneRoot = this.add.container(0, 0)

    this.worldRoot.add([this.lanesRoot, this.playerLaneRoot])

    this.feedbackText = this.add
      .text(0, 0, '', {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#ffffff',
        backgroundColor: '#16a34a',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5)
      .setDepth(100)
      .setVisible(false)

    this.playerShadow = this.add.ellipse(0, 0, 40, 10, 0x000000, 0.28).setDepth(20)
    this.playerSprite = this.add.image(0, 0, 'sr-player').setOrigin(0.5, 1).setDepth(21)

    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this)
    this.onResize()
    this.syncFromBridge(true)
  }

  override update() {
    this.syncFromBridge(false)
  }

  private onResize() {
    const w = this.scale.width
    const h = this.scale.height
    const laneH = Math.max(52, Math.round(h * 0.105))
    const tileW = Math.round(laneH * 0.88)
    const charH = Math.max(48, Math.round(h * 0.1))
    const playerLaneY = Math.round(h * 0.72)

    this.layout = {
      laneH,
      tileW,
      charH,
      centerX: w * 0.5,
      playerLaneY,
    }

    this.skyGfx.clear()
    this.skyGfx.fillStyle(0x9fe8ff, 1)
    this.skyGfx.fillRect(0, 0, w, Math.max(8, h * 0.04))

    this.feedbackText.setPosition(w * 0.5, h * 0.1)

    const zoom = Math.min(w / 360, h / 640) * 1.15
    this.worldRoot.setPosition(w * 0.5, playerLaneY)
    this.worldRoot.setScale(zoom)

    this.playerLaneRoot.setPosition(0, 0)
    this.lanesRoot.setPosition(0, -laneH)

    this.playerSprite.setDisplaySize(charH * 0.82, charH)
    this.playerShadow.setSize(charH * 0.55, charH * 0.12)

    if (this.lastSequenceStep >= 0) {
      this.rebuildWorld()
    }
  }

  private syncFromBridge(force: boolean) {
    const bridge = scaleRushPhaserBridgeRef.current
    if (!bridge) return

    if (force || bridge.sequenceStep !== this.lastSequenceStep) {
      this.lastSequenceStep = bridge.sequenceStep
      this.rebuildWorld()
    }

    if (bridge.advanceToken !== this.lastAdvanceToken) {
      this.lastAdvanceToken = bridge.advanceToken
      this.playHop()
    }

    if (bridge.missToken !== this.lastMissToken) {
      this.lastMissToken = bridge.missToken
      this.playMiss()
    }

    if (bridge.feedbackToken !== this.lastFeedbackToken) {
      this.lastFeedbackToken = bridge.feedbackToken
      this.showFeedback(bridge.feedback)
    }
  }

  private rebuildWorld() {
    const bridge = scaleRushPhaserBridgeRef.current
    if (!bridge || !this.layout) return

    this.lanesRoot.removeAll(true)
    this.playerLaneRoot.removeAll(true)

    const rows = buildCourseRows(bridge.config, bridge.sequenceStep, VISIBLE_AHEAD)
    const aheadRows = rows.filter((row) => !row.isPlayerRow).reverse()
    const playerRow = rows.find((row) => row.isPlayerRow)

    aheadRows.forEach((row, index) => {
      const depth = aheadRows.length - index
      const y = -depth * this.layout.laneH
      this.buildLane(row, y, row.isTarget ? 'target' : 'ahead', depth, this.lanesRoot)
    })

    if (playerRow) {
      this.buildLane(
        playerRow,
        0,
        playerRow.isStart ? 'start' : 'landed',
        0,
        this.playerLaneRoot,
      )

      const tileTopY = -this.layout.laneH * 0.08
      this.playerSprite.setPosition(0, tileTopY)
      this.playerShadow.setPosition(4, tileTopY + 2)

      if (!this.isHopping) {
        this.startIdleBounce(tileTopY)
      }
    }

    this.lanesRoot.y = -this.layout.laneH - this.scrollPixels
  }

  private buildLane(
    row: CourseRow,
    y: number,
    variant: TileVariant,
    depth: number,
    parent: Phaser.GameObjects.Container,
  ) {
    const { laneH } = this.layout
    const visual = laneVisualForRow(row)
    const lane = this.add.container(0, y)
    parent.add(lane)

    const depthScale = 0.9 + depth * 0.012
    const depthAlpha = 0.78 + depth * 0.028
    lane.setScale(depthScale)
    lane.setAlpha(Math.min(1, depthAlpha))

    const laneW = this.scale.width / this.worldRoot.scaleX + 80

    if (visual === 'grass') {
      const grass = this.add.tileSprite(0, 0, laneW, laneH, 'sr-grass')
      grass.setOrigin(0.5, 1)
      lane.add(grass)
    } else if (visual === 'river') {
      const water = this.add.tileSprite(0, 0, laneW, laneH, 'sr-water')
      water.setOrigin(0.5, 1)
      lane.add(water)
    } else if (visual === 'road') {
      lane.add(this.drawRoad(laneW, laneH))
    } else {
      lane.add(this.drawTracks(laneW, laneH))
    }

    const pathTile = this.buildPathTile(row, variant)
    lane.add(pathTile)
  }

  private drawRoad(width: number, height: number) {
    const g = this.add.graphics()
    g.fillStyle(0x5c5752, 1)
    g.fillRect(-width * 0.5, -height, width, height)
    g.fillStyle(0xfacc15, 0.85)
    const dashW = 14
    const y = -height * 0.5
    for (let x = -width * 0.5; x < width * 0.5; x += dashW * 2) {
      g.fillRect(x, y - 2, dashW, 4)
    }
    return g
  }

  private drawTracks(width: number, height: number) {
    const g = this.add.graphics()
    g.fillStyle(0x78716c, 1)
    g.fillRect(-width * 0.5, -height, width, height)
    g.fillStyle(0x6b4f2a, 1)
    for (let x = -width * 0.5; x < width * 0.5; x += 22) {
      g.fillRect(x, -height, 11, height)
    }
    return g
  }

  private buildPathTile(row: CourseRow, variant: TileVariant) {
    const { laneH, tileW } = this.layout
    const isStart = variant === 'start' || row.isStart
    const isTarget = !isStart && (variant === 'target' || row.isTarget)
    const isLanded = variant === 'landed'

    const tile = this.add.container(0, 0)
    const grass = this.add.image(0, 0, 'sr-grass')
    grass.setOrigin(0.5, 1)
    grass.setDisplaySize(tileW, laneH)
    tile.add(grass)

    const label = isStart ? 'GO' : row.noteLabel
    const fontSize = Math.max(14, Math.round(laneH * (isStart ? 0.2 : 0.28)))
    const text = this.add
      .text(0, -laneH * 0.72, label, {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: `${fontSize}px`,
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0.5)
    tile.add(text)

    if (isTarget) {
      grass.setTint(0xffffff)
      this.tweens.add({
        targets: grass,
        alpha: { from: 0.88, to: 1 },
        duration: 550,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
      this.tweens.add({
        targets: text,
        scale: { from: 1, to: 1.08 },
        duration: 550,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    } else if (isLanded) {
      grass.setAlpha(0.82)
      text.setAlpha(0.72)
    } else if (!isStart) {
      text.setAlpha(0.92)
    }

    return tile
  }

  private startIdleBounce(baseY: number) {
    this.stopIdleBounce()
    this.idleTween = this.tweens.add({
      targets: [this.playerSprite, this.playerShadow],
      y: `-=${Math.max(3, this.layout.charH * 0.04)}`,
      duration: 680,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
    this.playerSprite.y = baseY
    this.playerShadow.y = baseY + 2
  }

  private stopIdleBounce() {
    if (this.idleTween) {
      this.idleTween.stop()
      this.idleTween = null
    }
  }

  private playHop() {
    if (!this.layout) return
    const { laneH } = this.layout
    const hopDist = laneH * 0.95
    const baseSpriteY = this.playerSprite.y
    const baseShadowY = this.playerShadow.y

    this.isHopping = true
    this.stopIdleBounce()
    this.scrollTarget += laneH

    this.tweens.add({
      targets: this.lanesRoot,
      y: -this.layout.laneH - this.scrollTarget,
      duration: 440,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.scrollPixels = 0
        this.scrollTarget = 0
        this.lanesRoot.y = -this.layout.laneH
        this.rebuildWorld()
      },
    })

    this.tweens.add({
      targets: this.playerSprite,
      y: baseSpriteY - hopDist,
      duration: 200,
      ease: 'Quad.easeOut',
      yoyo: true,
      onYoyo: () => {
        this.tweens.add({
          targets: this.playerSprite,
          scaleY: 0.86,
          scaleX: 1.08,
          duration: 80,
          yoyo: true,
          ease: 'Quad.easeOut',
        })
      },
      onComplete: () => {
        this.isHopping = false
        this.playerSprite.y = baseSpriteY
        this.startIdleBounce(baseSpriteY)
      },
    })

    this.tweens.add({
      targets: this.playerShadow,
      y: baseShadowY - hopDist * 0.5,
      scaleX: 0.42,
      alpha: 0.45,
      duration: 200,
      ease: 'Quad.easeOut',
      yoyo: true,
      onComplete: () => {
        this.playerShadow.y = baseShadowY
        this.playerShadow.setScale(1)
        this.playerShadow.setAlpha(0.28)
      },
    })

    this.cameras.main.zoomTo(1.02, 120, 'Sine.easeOut', true, (_cam, _progress, _zoom) => {
      this.cameras.main.zoomTo(1, 180, 'Sine.easeOut')
    })
  }

  private playMiss() {
    this.cameras.main.shake(420, 0.006)
    this.tweens.add({
      targets: this.playerSprite,
      alpha: 0.55,
      duration: 90,
      yoyo: true,
      repeat: 1,
      onComplete: () => this.playerSprite.setAlpha(1),
    })
  }

  private showFeedback(feedback: ScaleRushFeedback) {
    if (!feedback) {
      this.feedbackText.setVisible(false)
      return
    }

    const label = FEEDBACK_LABELS[feedback]
    const bg =
      feedback === 'perfect' || feedback === 'good'
        ? '#16a34a'
        : feedback === 'timeout'
          ? '#ea580c'
          : '#dc2626'

    this.feedbackText.setText(label)
    this.feedbackText.setBackgroundColor(bg)
    this.feedbackText.setVisible(true)
    this.feedbackText.setAlpha(0)
    this.feedbackText.setScale(0.9)

    this.tweens.killTweensOf(this.feedbackText)
    this.tweens.add({
      targets: this.feedbackText,
      alpha: 1,
      scale: 1.04,
      duration: 160,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: this.feedbackText,
          alpha: 0,
          y: `-=12`,
          delay: 520,
          duration: 280,
          onComplete: () => {
            this.feedbackText.setVisible(false)
            this.feedbackText.y = this.scale.height * 0.1
          },
        })
      },
    })
  }

  shutdown() {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this)
    this.stopIdleBounce()
  }
}
