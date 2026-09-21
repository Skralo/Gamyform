/** Damped spring (semi-implicit Euler). Used for recoil and weapon sway. */
export class Spring {
  value = 0;
  velocity = 0;
  constructor(
    private stiffness = 240,
    private damping = 18,
  ) {}
  kick(impulse: number) {
    this.velocity += impulse;
  }
  update(dt: number, target = 0) {
    const force =
      -this.stiffness * (this.value - target) - this.damping * this.velocity;
    this.velocity += force * dt;
    this.value += this.velocity * dt;
    return this.value;
  }
}
