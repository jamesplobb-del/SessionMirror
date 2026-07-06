import Phaser from 'phaser'
import { ScaleRushPhaserScene } from './scaleRushPhaserScene'

export function createScaleRushPhaserGame(parent: HTMLElement): Phaser.Game {
  const width = parent.clientWidth || window.innerWidth
  const height = parent.clientHeight || window.innerHeight

  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width,
    height,
    backgroundColor: '#2d8a3e',
    audio: {
      noAudio: true,
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.NO_CENTER,
      width,
      height,
    },
    scene: [ScaleRushPhaserScene],
    fps: {
      target: 60,
      forceSetTimeOut: true,
    },
    render: {
      antialias: true,
      pixelArt: true,
      roundPixels: true,
    },
  })
}
