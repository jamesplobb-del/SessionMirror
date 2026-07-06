import Phaser from 'phaser'
import { SCALE_RUSH_ASSETS } from '../scaleRushAssets'
import { buildCourseRows, type CourseRow } from '../scaleRushMusicLogic'
import type { ScaleRushFeedback } from '../scaleRushTypes'
import { scaleRushPhaserBridgeRef } from './scaleRushPhaserBridge'

const SCENE_KEY = 'ScaleRushWorld'
/** Upcoming note rows only — player row is separate. */
const VISIBLE_AHEAD = 5

/** Visual lane order — does not affect note logic. */
const LANE_PATTERN = ['grass', 'road', 'grass', 'river', 'grass', 'tracks', 'grass'] as const
type LaneVisual = (typeof LANE_PATTERN)[number]

const LANE_FILL: Record<LaneVisual, number> = {
  grass: 0x3d9a4a,
  road: 0x5c5752,
  river: 0x2f7fbf,
  tracks: 0x78716c,
}

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

/** Isometric grass-block layout (sprite origin 0.5, 1 at dirt base). */
const PATH_BLOCK_TOP_FACE_Y = 0.52
const PATH_BLOCK_LABEL_Y = 0.63
const PATH_BLOCK_GLOW_Y = 0.61

interface LaneLayout {
  laneH: number
  pathBlockSize: number
  charH: number
  playerAnchorY: number
  laneW: number
  pathCorridorW: number
}

export class ScaleRushPhaserScene extends Phaser.Scene {
  private worldRoot!: Phaser.GameObjects.Container
  private pathCorridorGfx!: Phaser.GameObjects.Graphics
  private lanesRoot!: Phaser.GameObjects.Container
  private playerLaneRoot!: Phaser.GameObjects.Container
  private playerObjectsRoot!: Phaser.GameObjects.Container
  private playerSprite!: Phaser.GameObjects.Image
  private playerShadow!: Phaser.GameObjects.Ellipse
  private feedbackText!: Phaser.GameObjects.Text
  private skyGfx!: Phaser.GameObjects.Graphics

  private lastAdvanceToken = 0
  private lastMissToken = 0
  private lastFeedbackToken = 0
  private lastSequenceStep = -1
  private isHopping = false
  private idleTween: Phaser.Tweens.Tween | null = null
  private layout!: LaneLayout
  constructor() {
    super(SCENE_KEY)
  }

  preload() {
    this.load.image('sr-grass-lane', SCALE_RUSH_ASSETS.grassLane)
    this.load.image('sr-grass-path', SCALE_RUSH_ASSETS.grassPath)
    this.load.image('sr-water-lane', SCALE_RUSH_ASSETS.waterLane)
    this.load.image('sr-road-lane', SCALE_RUSH_ASSETS.roadLane)
    this.load.image('sr-log', SCALE_RUSH_ASSETS.log)
    this.load.image('sr-rock', SCALE_RUSH_ASSETS.rock)
    this.load.image('sr-crate', SCALE_RUSH_ASSETS.crate)
    this.load.image('sr-player', SCALE_RUSH_ASSETS.trumpetPlayer)
  }

  create() {
    this.cameras.main.setBackgroundColor('#2a7d3c')

    this.skyGfx = this.add.graphics().setDepth(0).setScrollFactor(0)

    this.worldRoot = this.add.container(0, 0).setDepth(10)
    this.pathCorridorGfx = this.add.graphics()
    this.lanesRoot = this.add.container(0, 0)
    this.playerLaneRoot = this.add.container(0, 0)
    this.playerObjectsRoot = this.add.container(0, 0)
    this.worldRoot.add([
      this.pathCorridorGfx,
      this.lanesRoot,
      this.playerLaneRoot,
      this.playerObjectsRoot,
    ])

    this.playerShadow = this.add.ellipse(0, 0, 40, 10, 0x000000, 0.32).setDepth(20)
    this.playerSprite = this.add.image(0, 0, 'sr-player').setOrigin(0.5, 1).setDepth(21)
    this.playerObjectsRoot.add([this.playerShadow, this.playerSprite])

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
      .setScrollFactor(0)
      .setVisible(false)

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
    const laneH = Phaser.Math.Clamp(Math.round(h * 0.108), 52, 76)
    const pathBlockSize = Math.round(laneH * 0.86)
    const charH = Phaser.Math.Clamp(Math.round(h * 0.126), 56, 92)
    const playerAnchorY = Math.round(h * 0.76)
    const laneW = w + 52
    const pathCorridorW = pathBlockSize * 1.22

    this.layout = {
      laneH,
      pathBlockSize,
      charH,
      playerAnchorY,
      laneW,
      pathCorridorW,
    }

    this.skyGfx.clear()
    this.skyGfx.fillStyle(0x9fe8ff, 1)
    this.skyGfx.fillRect(0, 0, w, Math.max(6, h * 0.03))

    this.feedbackText.setPosition(w * 0.5, h * 0.1)

    this.worldRoot.setPosition(w * 0.5, 0)
    this.worldRoot.setScale(1)

    this.cameras.main.stopFollow()
    this.cameras.main.setZoom(1)
    this.cameras.main.setScroll(0, 0)
    this.playerLaneRoot.setPosition(0, playerAnchorY)
    this.playerObjectsRoot.setPosition(0, playerAnchorY)
    this.lanesRoot.setPosition(0, playerAnchorY)

    const playerTex = this.textures.exists('sr-player') ? this.textures.get('sr-player') : null
    const src = playerTex?.getSourceImage() as HTMLImageElement | undefined
    const aspect = src && src.width > 0 ? src.height / src.width : 1
    this.playerSprite.setDisplaySize(charH / aspect, charH)
    this.playerShadow.setSize(charH * 0.5, charH * 0.1)

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
    this.drawPathCorridor()
    this.pathCorridorGfx.y = 0

    const rows = buildCourseRows(bridge.config, bridge.sequenceStep, VISIBLE_AHEAD)
    const aheadRows = rows.filter((row) => !row.isPlayerRow).reverse()
    const playerRow = rows.find((row) => row.isPlayerRow)
    const { laneH } = this.layout
    const maxDepth = aheadRows.length

    aheadRows.forEach((row, index) => {
      const depth = aheadRows.length - index
      const y = -depth * laneH
      this.buildLane(
        row,
        y,
        row.isTarget ? 'target' : 'ahead',
        depth,
        maxDepth,
        this.lanesRoot,
      )
    })

    if (playerRow) {
      this.buildLane(
        playerRow,
        0,
        playerRow.isStart ? 'start' : 'landed',
        0,
        maxDepth,
        this.playerLaneRoot,
      )

      const feetY = -this.layout.pathBlockSize * PATH_BLOCK_TOP_FACE_Y
      this.playerSprite.setPosition(0, feetY)
      this.playerShadow.setPosition(2, feetY + 3)

      if (!this.isHopping) {
        this.startIdleBounce(feetY)
      }
    }
  }

  private drawPathCorridor() {
    const { laneH, playerAnchorY, pathCorridorW } = this.layout
    const bridge = scaleRushPhaserBridgeRef.current
    if (!bridge) return

    const rows = buildCourseRows(bridge.config, bridge.sequenceStep, VISIBLE_AHEAD)
    const span = (rows.length + 0.5) * laneH

    this.pathCorridorGfx.clear()
    this.pathCorridorGfx.fillStyle(0x2f6b38, 0.55)
    this.pathCorridorGfx.fillRoundedRect(
      -pathCorridorW * 0.5,
      playerAnchorY - span,
      pathCorridorW,
      span + laneH * 0.35,
      10,
    )
    this.pathCorridorGfx.lineStyle(2, 0x4ade80, 0.35)
    this.pathCorridorGfx.strokeRoundedRect(
      -pathCorridorW * 0.5,
      playerAnchorY - span,
      pathCorridorW,
      span + laneH * 0.35,
      10,
    )
  }

  private buildLane(
    row: CourseRow,
    y: number,
    variant: TileVariant,
    depth: number,
    maxDepth: number,
    parent: Phaser.GameObjects.Container,
  ) {
    const { laneH, laneW } = this.layout
    const visual = laneVisualForRow(row)
    const lane = this.add.container(0, y)
    parent.add(lane)

    const depthT = maxDepth > 1 ? (depth - 1) / (maxDepth - 1) : 0
    const depthScale = Phaser.Math.Linear(0.94, 1, 1 - depthT * 0.06)
    const depthAlpha = Phaser.Math.Linear(0.42, 1, 1 - depthT * 0.58)
    lane.setScale(depthScale)
    lane.setAlpha(depth === 0 ? 1 : depthAlpha)

    this.addLaneBackdrop(lane, visual, laneW, laneH, row.rowOffset)

    if (visual === 'grass' && row.rowOffset % 3 === 1) {
      this.addGrassDecor(lane, laneH, laneW, row.rowOffset)
    } else if (visual === 'river' && row.rowOffset % 2 === 0) {
      this.addRiverLog(lane, laneH, laneW, row.rowOffset)
    } else if (visual === 'road' && row.rowOffset % 4 === 2) {
      this.addRoadDecor(lane, laneH, laneW, row.rowOffset)
    }

    const pathTile = this.buildPathTile(row, variant, depth, maxDepth)
    lane.add(pathTile)
  }

  private addLaneBackdrop(
    lane: Phaser.GameObjects.Container,
    visual: LaneVisual,
    laneW: number,
    laneH: number,
    rowOffset: number,
  ) {
    const fill = LANE_FILL[visual]
    const g = this.add.graphics()
    g.fillStyle(fill, 0.92)
    g.fillRect(-laneW * 0.5, -laneH, laneW, laneH)

    const accentKey =
      visual === 'grass'
        ? 'sr-grass-lane'
        : visual === 'river'
          ? 'sr-water-lane'
          : visual === 'road'
            ? 'sr-road-lane'
            : null

    if (accentKey) {
      const stripW = laneW * 0.22
      const side = rowOffset % 2 === 0 ? -1 : 1
      const accent = this.add.tileSprite(side * (laneW * 0.39), 0, stripW, laneH, accentKey)
      accent.setOrigin(0.5, 1)
      accent.setAlpha(0.22)
      accent.setTileScale(2.2, 1.4)
      lane.add(accent)
    }

    if (visual === 'tracks') {
      g.fillStyle(0x6b4f2a, 0.5)
      for (let x = -laneW * 0.5; x < laneW * 0.5; x += 28) {
        g.fillRect(x, -laneH, 9, laneH)
      }
    }

    lane.add(g)
  }

  private addGrassDecor(
    lane: Phaser.GameObjects.Container,
    laneH: number,
    laneW: number,
    rowOffset: number,
  ) {
    const decorH = laneH * 0.28
    const side = rowOffset % 2 === 0 ? -1 : 1
    const rock = this.add
      .image(side * laneW * 0.34, -laneH * 0.42, 'sr-rock')
      .setOrigin(0.5, 1)
      .setDisplaySize(decorH, decorH)
      .setAlpha(0.38)
    lane.add(rock)
  }

  private addRiverLog(
    lane: Phaser.GameObjects.Container,
    laneH: number,
    laneW: number,
    rowOffset: number,
  ) {
    const logH = laneH * 0.22
    const logY = -laneH * 0.4
    const startX = rowOffset % 2 === 0 ? -laneW * 0.38 : laneW * 0.22
    const log = this.add
      .image(startX, logY, 'sr-log')
      .setOrigin(0.5, 1)
      .setDisplaySize(logH * 1.5, logH)
      .setAlpha(0.35)
    lane.add(log)

    this.tweens.add({
      targets: log,
      x: startX + (rowOffset % 2 === 0 ? laneW * 0.35 : -laneW * 0.35),
      duration: 4200,
      yoyo: true,
      repeat: -1,
      ease: 'Linear',
    })
  }

  private addRoadDecor(
    lane: Phaser.GameObjects.Container,
    laneH: number,
    laneW: number,
    rowOffset: number,
  ) {
    const crateH = laneH * 0.26
    const side = rowOffset % 2 === 0 ? 1 : -1
    const crate = this.add
      .image(side * laneW * 0.36, -laneH * 0.38, 'sr-crate')
      .setOrigin(0.5, 1)
      .setDisplaySize(crateH, crateH)
      .setAlpha(0.32)
    lane.add(crate)
  }

  private buildPathTile(
    row: CourseRow,
    variant: TileVariant,
    depth: number,
    maxDepth: number,
  ) {
    const { pathBlockSize } = this.layout
    const isStart = variant === 'start' || row.isStart
    const isTarget = !isStart && (variant === 'target' || row.isTarget)
    const isLanded = variant === 'landed'
    const isAhead = variant === 'ahead'

    const tile = this.add.container(0, 0)
    const grass = this.add.image(0, 0, 'sr-grass-path')
    grass.setOrigin(0.5, 1)
    grass.setDisplaySize(pathBlockSize, pathBlockSize)
    tile.add(grass)

    const topFaceY = -pathBlockSize * PATH_BLOCK_GLOW_Y
    const labelY = -pathBlockSize * PATH_BLOCK_LABEL_Y

    if (isTarget) {
      const glow = this.add.ellipse(
        0,
        topFaceY,
        pathBlockSize * 0.62,
        pathBlockSize * 0.28,
        0xfde047,
        0.3,
      )
      tile.addAt(glow, 0)
      this.tweens.add({
        targets: glow,
        alpha: { from: 0.2, to: 0.42 },
        scaleX: { from: 0.94, to: 1.08 },
        scaleY: { from: 0.94, to: 1.08 },
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    }

    const label = isStart ? 'GO' : row.noteLabel
    const fontSize = Math.max(13, Math.round(pathBlockSize * (isStart ? 0.19 : 0.24)))
    const text = this.add
      .text(0, labelY, label, {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: `${fontSize}px`,
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#14532d',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0.5)
    tile.add(text)

    if (isTarget) {
      grass.clearTint()
      this.tweens.add({
        targets: [grass, text],
        alpha: { from: 0.92, to: 1 },
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    } else if (isLanded) {
      grass.setAlpha(0.78)
      text.setAlpha(0.65)
    } else if (isAhead && depth > 0) {
      const depthT = maxDepth > 1 ? (depth - 1) / (maxDepth - 1) : 0
      const fade = Phaser.Math.Linear(0.88, 0.52, depthT)
      grass.setAlpha(fade)
      text.setAlpha(fade * 0.95)
    } else if (!isStart) {
      text.setAlpha(0.9)
    }

    return tile
  }

  private startIdleBounce(baseY: number) {
    this.stopIdleBounce()
    this.idleTween = this.tweens.add({
      targets: [this.playerSprite, this.playerShadow],
      y: `-=${Math.max(2, this.layout.charH * 0.035)}`,
      duration: 720,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
    this.playerSprite.y = baseY
    this.playerShadow.y = baseY + 3
  }

  private stopIdleBounce() {
    if (this.idleTween) {
      this.idleTween.stop()
      this.idleTween = null
    }
  }

  private playHop() {
    if (!this.layout) return
    const { laneH, playerAnchorY } = this.layout
    const hopDist = laneH * 0.92
    const baseSpriteY = this.playerSprite.y
    const baseShadowY = this.playerShadow.y

    this.isHopping = true
    this.stopIdleBounce()

    const lanesBaseY = playerAnchorY
    this.tweens.add({
      targets: this.lanesRoot,
      y: lanesBaseY + laneH,
      duration: 420,
      ease: 'Cubic.easeOut',
    })
    this.tweens.add({
      targets: this.pathCorridorGfx,
      y: `+=${laneH}`,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.lanesRoot.y = lanesBaseY
        this.pathCorridorGfx.y = 0
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
          scaleY: 0.88,
          scaleX: 1.06,
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
      y: baseShadowY - hopDist * 0.45,
      scaleX: 0.4,
      alpha: 0.4,
      duration: 200,
      ease: 'Quad.easeOut',
      yoyo: true,
      onComplete: () => {
        this.playerShadow.y = baseShadowY
        this.playerShadow.setScale(1)
        this.playerShadow.setAlpha(0.32)
      },
    })

    this.cameras.main.zoomTo(1.03, 110, 'Sine.easeOut', true, () => {
      this.cameras.main.zoomTo(1, 170, 'Sine.easeOut')
    })
  }

  private playMiss() {
    this.cameras.main.shake(420, 0.005)
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
    this.cameras.main.stopFollow()
    this.stopIdleBounce()
  }
}
