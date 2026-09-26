declare module '@3d-dice/dice-box' {
  const DiceBox: new (config: Record<string, unknown>) => {
    init(): Promise<void>
    roll(notation: unknown, options?: unknown): Promise<unknown>
    reroll(notation: unknown, options?: unknown): Promise<unknown>
    clear(): void
  }
  export default DiceBox
}
