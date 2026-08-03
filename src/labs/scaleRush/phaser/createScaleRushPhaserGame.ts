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
    backgroundColor: '#091522',
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
      pixelArt: false,
      roundPixels: false,
    },
  })
}
