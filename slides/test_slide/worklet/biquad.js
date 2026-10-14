// AudioWorklet for the code page demo: white noise through a lowpass biquad
// (coefficients from the Audio EQ Cookbook). Options: processorOptions { cutoff, q, gain }.
class BiquadDemo extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { cutoff = 800, q = Math.SQRT1_2, gain = 0.3 } = options?.processorOptions ?? {};
    const w0 = (2 * Math.PI * cutoff) / sampleRate;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * q);
    const a0 = 1 + alpha;
    this.b0 = (1 - cos) / 2 / a0;
    this.b1 = (1 - cos) / a0;
    this.b2 = this.b0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
    this.gain = gain;
    this.started = false;
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    const first = out?.[0];
    if (!first) return true;
    if (!this.started) {
      this.started = true;
      // console.log cannot be hooked inside an AudioWorklet: send logs through the port instead.
      this.port.postMessage({ type: "log", level: "log", args: ["biquad running"] });
    }
    for (let i = 0; i < first.length; i++) {
      const x = (Math.random() * 2 - 1) * this.gain;
      const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
      this.x2 = this.x1;
      this.x1 = x;
      this.y2 = this.y1;
      this.y1 = y;
      first[i] = y;
    }
    for (let ch = 1; ch < out.length; ch++) out[ch].set(first);
    return true;
  }
}

registerProcessor("biquad-demo", BiquadDemo);
