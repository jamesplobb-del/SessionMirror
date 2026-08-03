import Phaser from 'phaser'
import { buildCourseRows, type CourseRow } from '../scaleRushMusicLogic'
import { getScaleRushPlayerModel, SCALE_RUSH_PLAYER_MODELS } from '../scaleRushPlayerModels'
import type { ScaleRushFeedback } from '../scaleRushTypes'
import { scaleRushPhaserBridgeRef } from './scaleRushPhaserBridge'

const SCENE_KEY = 'ScaleRushWorld'
const VISIBLE_AHEAD = 5

const FEEDBACK_LABELS = {
  perfect: 'Perfect',
  good: 'Good',
  wrong: 'Try the next note',
  timeout: 'Time up',
} as const

type PadVariant = 'ahead' | 'target' | 'landed' | 'start'

interface CourseLayout {
  width: number
  height: number
  stepY: number
  padW: number
  padH: number
  characterH: number
  playerY: number
  sideOffset: number
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}

export class ScaleRushPhaserScene extends Phaser.Scene {
  private backgroundGfx!: Phaser.GameObjects.Graphics
  private trailGfx!: Phaser.GameObjects.Graphics
  private padsRoot!: Phaser.GameObjects.Container
  private playerRoot!: Phaser.GameObjects.Container
  private playerSprite!: Phaser.GameObjects.Image
  private playerShadow!: Phaser.GameObjects.Ellipse
  private feedbackText!: Phaser.GameObjects.Text
  private layout!: CourseLayout

  private lastAdvanceToken = 0
  private lastMissToken = 0
  private lastFeedbackToken = 0
  private lastSequenceStep = -1
  private isHopping = false
  private idleTween: Phaser.Tweens.Tween | null = null

  constructor() {
    super(SCENE_KEY)
  }

  preload() {
    SCALE_RUSH_PLAYER_MODELS.forEach((model) => {
      this.load.image(`sr-player-${model.id}`, model.asset)
    })
  }

  create() {
    this.cameras.main.setBackgroundColor('#091522')

    this.backgroundGfx = this.add.graphics().setDepth(0)
    this.trailGfx = this.add.graphics().setDepth(5)
    this.padsRoot = this.add.container(0, 0).setDepth(10)
    this.playerRoot = this.add.container(0, 0).setDepth(30)
    this.playerShadow = this.add.ellipse(0, 0, 44, 11, 0x020817, 0.4)
    this.playerSprite = this.add
      .image(0, 0, 'sr-player-trumpeter')
      .setOrigin(0.5, 1)
    this.playerRoot.add([this.playerShadow, this.playerSprite])

    this.feedbackText = this.add
      .text(0, 0, '', {
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: '13px',
        fontStyle: '600',
        color: '#ffffff',
        backgroundColor: '#178C5B',
        padding: { x: 13, y: 7 },
      })
      .setOrigin(0.5)
      .setDepth(100)
      .setVisible(false)

    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this)
    this.onResize()
    this.syncFromBridge(true)
  }

  override update() {
    this.syncFromBridge(false)
  }

  private onResize() {
    const width = this.scale.width
    const height = this.scale.height
    const shortViewport = height < 650
    const stepY = Phaser.Math.Clamp(Math.round(height * (shortViewport ? 0.09 : 0.085)), 52, 70)
    const padW = Phaser.Math.Clamp(Math.round(width * 0.25), 78, 108)
    const padH = Math.round(padW * 0.44)

    this.layout = {
      width,
      height,
      stepY,
      padW,
      padH,
      characterH: Phaser.Math.Clamp(Math.round(height * 0.09), 54, 76),
      playerY: Math.round(height * (shortViewport ? 0.65 : 0.67)),
      sideOffset: Phaser.Math.Clamp(Math.round(width * 0.17), 48, 74),
    }

    this.drawBackground()
    this.feedbackText.setPosition(width * 0.5, Math.max(84, height * 0.14))

    if (this.lastSequenceStep >= 0) {
      this.rebuildCourse()
    }
  }

  private drawBackground() {
    const { width, height, playerY, stepY } = this.layout
    const g = this.backgroundGfx
    g.clear()

    const bands = [0x081522, 0x0a1b2a, 0x0c2233, 0x10293b, 0x133246, 0x16394c]
    bands.forEach((color, index) => {
      const bandH = Math.ceil(height / bands.length)
      g.fillStyle(color, 1)
      g.fillRect(0, index * bandH, width, bandH + 1)
    })

    // A quiet stage keeps the note pads legible without competing scenery.
    g.fillStyle(0x4cc9f0, 0.035)
    g.fillTriangle(width * 0.04, height, width * 0.5, 0, width * 0.47, height)
    g.fillStyle(0x8b5cf6, 0.045)
    g.fillTriangle(width * 0.96, height, width * 0.54, 0, width * 0.53, height)

    for (let row = -1; row <= VISIBLE_AHEAD + 1; row += 1) {
      const y = playerY - row * stepY
      g.lineStyle(1, 255, 0.055)
      g.lineBetween(width * 0.08, y, width * 0.92, y)
    }

    const dots = [
      [0.12, 0.18, 2.2],
      [0.86, 0.24, 2.8],
      [0.18, 0.43, 1.8],
      [0.8, 0.5, 1.8],
      [0.1, 0.66, 2.4],
      [0.9, 0.7, 2],
    ]
    dots.forEach(([x, y, radius], index) => {
      g.fillStyle(index % 2 === 0 ? 0x7dd3fc : 0xc4b5fd, 0.25)
      g.fillCircle(width * x!, height * y!, radius!)
    })
  }

  private pathX(sequenceIndex: number): number {
    const side = positiveModulo(sequenceIndex, 2) === 0 ? 1 : -1
    return this.layout.width * 0.5 + side * this.layout.sideOffset
  }

  private syncFromBridge(force: boolean) {
    const bridge = scaleRushPhaserBridgeRef.current
    if (!bridge || !this.layout) return

    const oldPlayerX = this.playerRoot.x || this.pathX(bridge.sequenceStep - 1)
    const sequenceChanged = force || bridge.sequenceStep !== this.lastSequenceStep
    if (sequenceChanged) {
      this.lastSequenceStep = bridge.sequenceStep
      this.rebuildCourse()
    }

    if (bridge.advanceToken !== this.lastAdvanceToken) {
      this.lastAdvanceToken = bridge.advanceToken
      this.playHop(oldPlayerX)
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

  private rebuildCourse() {
    const bridge = scaleRushPhaserBridgeRef.current
    if (!bridge || !this.layout) return

    this.padsRoot.removeAll(true)
    this.trailGfx.clear()

    const rows = buildCourseRows(bridge.config, bridge.sequenceStep, VISIBLE_AHEAD)
      .sort((a, b) => a.rowOffset - b.rowOffset)
    const positions = rows.map((row) => ({
      row,
      x: this.pathX(row.sequenceIndex),
      y: this.layout.playerY - row.rowOffset * this.layout.stepY,
    }))

    this.drawTrail(positions)

    positions
      .slice()
      .reverse()
      .forEach(({ row, x, y }) => {
        const variant: PadVariant = row.isPlayerRow
          ? row.isStart
            ? 'start'
            : 'landed'
          : row.isTarget
            ? 'target'
            : 'ahead'
        this.padsRoot.add(this.buildNotePad(row, variant, x, y))
      })

    const playerRow = positions.find(({ row }) => row.isPlayerRow)
    if (!playerRow) return

    const model = getScaleRushPlayerModel(bridge.config.playerModel)
    const textureKey = `sr-player-${model.id}`
    if (this.textures.exists(textureKey)) this.playerSprite.setTexture(textureKey)

    const source = this.textures.get(textureKey).getSourceImage() as
      | { width?: number; height?: number }
      | undefined
    const aspect = source?.width && source?.height ? source.width / source.height : 1
    const displayH = this.layout.characterH * model.scale
    this.playerSprite.setDisplaySize(displayH * aspect, displayH)

    const feetY = -this.layout.padH * 0.18
    this.playerRoot.setPosition(playerRow.x, playerRow.y)
    this.playerSprite.setPosition(0, feetY)
    this.playerShadow
      .setPosition(0, feetY + 3)
      .setSize(Math.max(34, displayH * 0.55), Math.max(8, displayH * 0.12))

    if (!this.isHopping) this.startIdleBounce(feetY)
  }

  private drawTrail(positions: Array<{ row: CourseRow; x: number; y: number }>) {
    if (positions.length < 2) return

    const g = this.trailGfx
    g.lineStyle(9, 0x020817, 0.22)
    g.beginPath()
    g.moveTo(positions[0]!.x, positions[0]!.y)
    positions.slice(1).forEach(({ x, y }) => g.lineTo(x, y))
    g.strokePath()

    g.lineStyle(2, 0x8bdcff, 0.35)
    g.beginPath()
    g.moveTo(positions[0]!.x, positions[0]!.y)
    positions.slice(1).forEach(({ x, y }) => g.lineTo(x, y))
    g.strokePath()
  }

  private buildNotePad(row: CourseRow, variant: PadVariant, x: number, y: number) {
    const { padW, padH } = this.layout
    const container = this.add.container(x, y)
    const isTarget = variant === 'target'
    const isLanded = variant === 'landed' || variant === 'start'
    const depthFade = Phaser.Math.Clamp(1 - row.rowOffset * 0.1, 0.48, 1)

    const shadow = this.add.ellipse(2, 5, padW * 0.88, padH * 0.72, 0x020817, 0.32)
    const pad = this.add.graphics()

    if (isTarget) {
      const glow = this.add.ellipse(0, 0, padW * 1.23, padH * 1.65, 0xfacb4b, 0.16)
      container.add(glow)
      this.tweens.add({
        targets: glow,
        alpha: { from: 0.11, to: 0.28 },
        scaleX: { from: 0.94, to: 1.08 },
        scaleY: { from: 0.94, to: 1.08 },
        duration: 760,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    }

    pad.fillStyle(isTarget ? 0xf9cf58 : isLanded ? 0x27516a : 0x1f4962, depthFade)
    pad.fillRoundedRect(-padW * 0.5, -padH * 0.5, padW, padH, padH * 0.46)
    pad.lineStyle(
      isTarget ? 3 : 1.5,
      isTarget ? 0xfff1ae : 0x8bdcff,
      isTarget ? 0.95 : 0.4 * depthFade,
    )
    pad.strokeRoundedRect(-padW * 0.5, -padH * 0.5, padW, padH, padH * 0.46)

    const label = row.isStart ? 'START' : row.noteLabel
    const text = this.add
      .text(0, 0, label, {
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: `${Math.round(padH * (row.isStart ? 0.28 : 0.48))}px`,
        fontStyle: '700',
        color: isTarget ? '#15283A' : '#F4FAFF',
      })
      .setOrigin(0.5)
      .setAlpha(depthFade)

    container.add([shadow, pad, text])

    if (isTarget) {
      const next = this.add
        .text(0, -padH * 0.9, 'NEXT', {
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
          fontSize: '10px',
          fontStyle: '700',
          color: '#F9E8A6',
          backgroundColor: '#26384B',
          padding: { x: 7, y: 3 },
        })
        .setOrigin(0.5)
      container.add(next)
    }

    return container
  }

  private startIdleBounce(baseY: number) {
    this.stopIdleBounce()
    this.playerSprite.y = baseY
    this.playerShadow.y = baseY + 3
    this.idleTween = this.tweens.add({
      targets: this.playerSprite,
      y: baseY - 2.5,
      duration: 820,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
  }

  private stopIdleBounce() {
    this.idleTween?.stop()
    this.idleTween = null
  }

  private playHop(fromX: number) {
    if (!this.layout) return
    const destinationX = this.playerRoot.x
    const baseY = this.playerSprite.y
    this.isHopping = true
    this.stopIdleBounce()
    this.playerRoot.x = fromX

    this.tweens.add({
      targets: this.playerRoot,
      x: destinationX,
      duration: 430,
      ease: 'Sine.easeInOut',
    })
    this.tweens.add({
      targets: this.playerSprite,
      y: baseY - this.layout.stepY * 0.72,
      duration: 215,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.isHopping = false
        this.playerSprite.y = baseY
        this.startIdleBounce(baseY)
      },
    })
    this.tweens.add({
      targets: this.playerShadow,
      scaleX: 0.55,
      alpha: 0.18,
      duration: 215,
      yoyo: true,
      ease: 'Quad.easeOut',
    })
  }

  private playMiss() {
    this.cameras.main.shake(300, 0.004)
    this.tweens.add({
      targets: this.playerSprite,
      alpha: 0.48,
      duration: 80,
      yoyo: true,
      repeat: 1,
      onComplete: () => this.playerSprite.setAlpha(1),
    })
  }

  private showFeedback(feedback: ScaleRushFeedback) {
    if (!feedback) return

    const success = feedback === 'perfect' || feedback === 'good'
    this.feedbackText
      .setText(FEEDBACK_LABELS[feedback])
      .setBackgroundColor(success ? '#178C5B' : feedback === 'timeout' ? '#B05D24' : '#A93E4C')
      .setVisible(true)
      .setAlpha(0)
      .setY(Math.max(84, this.layout.height * 0.14))

    this.tweens.killTweensOf(this.feedbackText)
    this.tweens.add({
      targets: this.feedbackText,
      alpha: 1,
      y: `+=4`,
      duration: 140,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: this.feedbackText,
          alpha: 0,
          delay: 500,
          duration: 240,
          onComplete: () => this.feedbackText.setVisible(false),
        })
      },
    })
  }

  shutdown() {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this)
    this.stopIdleBounce()
  }
}
