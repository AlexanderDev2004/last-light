/**
 * Lazy 3D dice stage (Babylon + Ammo physics via @3d-dice/dice-box).
 * The library ships no types, so the surface we use is declared here.
 * Everything runs client-side only; importers must call from an effect.
 */

export interface Dice3DResult {
  groupId: number
  rollId: number
  sides: number
  theme?: string
  themeColor?: string | null
  value: number
}

export interface Dice3DGroup {
  id: number
  qty: number
  sides: number
  rolls: Dice3DResult[]
  value: number
  theme?: string
  themeColor?: string | null
}

export interface Dice3DRollObject {
  qty: number
  sides: number
  theme?: string
  themeColor?: string
}

interface DiceBoxInstance {
  init(): Promise<void>
  roll(notation: unknown, options?: unknown): Promise<Dice3DGroup[]>
  reroll(notation: unknown, options?: unknown): Promise<Dice3DResult[]>
  clear(): void
}

interface DiceBoxCtor {
  new (config: Record<string, unknown>): DiceBoxInstance
}

/** Bone for the living, ash for the dark, ember for hope. */
export const DICE_COLORS = {
  light: '#ECE4D0',
  dark: '#A9A094',
  hope: '#E08A3C',
} as const

let box: DiceBoxInstance | null = null
let initPromise: Promise<DiceBoxInstance> | null = null

async function loadBox(container: string): Promise<DiceBoxInstance> {
  if (box) return box
  if (!initPromise) {
    initPromise = (async () => {
      const mod = (await import('@3d-dice/dice-box')) as unknown as {
        default: DiceBoxCtor
      }
      const instance = new mod.default({
        container,
        assetPath: '/assets/',
        theme: 'default',
        scale: 6,
        throwForce: 6,
        spinForce: 5,
        enableShadows: true,
        lightIntensity: 0.9,
        delay: 10,
      })
      await instance.init()
      box = instance
      return instance
    })().catch((e) => {
      initPromise = null
      throw e
    })
  }
  return initPromise
}

export async function ensureDiceBox(container: string): Promise<DiceBoxInstance | null> {
  try {
    return await loadBox(container)
  } catch {
    box = null
    initPromise = null
    return null
  }
}

export function dropDiceBox() {
  try {
    box?.clear()
  } catch {
    // ignore — engine teardown is best-effort
  }
  box = null
  initPromise = null
}
