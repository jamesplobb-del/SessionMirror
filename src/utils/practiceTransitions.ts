/** One app-level transition at a time. Repeated taps share work; competing navigation fails clearly. */
export class PracticeTransitionGate {
  private flight: { key: string; promise: Promise<void> } | null = null
  get busy(): boolean { return this.flight !== null }
  run(key: string, work: () => Promise<void>): Promise<void> {
    if (this.flight) return this.flight.key === key ? this.flight.promise
      : Promise.reject(new Error('Another practice item is opening. Try again in a moment.'))
    const promise = Promise.resolve().then(work).finally(() => { this.flight = null })
    this.flight = { key, promise }
    return promise
  }
}
