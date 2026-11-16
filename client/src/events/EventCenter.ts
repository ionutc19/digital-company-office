import Phaser from 'phaser'

/** Phaser-side events consumed by the React panels. */
export const phaserEvents = new Phaser.Events.EventEmitter()

export enum Event {
  AGENT_NPC_CLICKED = 'agent-npc-clicked',
}
