# 6G AI-RAN: Neural Receiver Constellation Simulation

This interactive web-based simulation demonstrates the technical advantages of **Neural Receivers** over traditional mathematical models in 5G/6G RAN systems.

## 🚀 Key Features
- **16-QAM & 64-QAM Support**: Toggle between standard and high-order modulation schemes.
- **Hardware Impairment Simulation**: Real-world modeling of Power Amplifier (PA) non-linear distortion (AM-AM/AM-PM).
- **Neural vs. Traditional**: Compare how a traditional linear grid receiver fails under distortion vs. how a Neural Receiver utilizes learned probability distributions and warped decision boundaries.
- **Batch Testing**: Run accuracy statistics (10-shot bursts) to see real-time performance gains.

## 🛠 Technology Stack
- Vanilla JavaScript (Mathematical Modeling)
- HTML5 / CSS3 (Responsive UI & Animations)
- SVG (Dynamic Constellation Visualization)

## 📖 How it Works
1. **Transmit (Tx)**: Select a symbol. The signal is passed through a non-linear PA model, causing compression at outer constellation points.
2. **Channel**: Random AWGN noise is added to simulate real-world transmission.
3. **Receive (Rx)**: 
   - **Traditional Mode**: Uses a fixed Euclidean grid. Fails when distortion pushes symbols across straight boundaries.
   - **Neural Mode**: Uses an inverse distortion mapping (Neural Receiver) to "un-warp" the space and recover the signal accurately.

## 🌍 Deployment
Hosted on GitHub Pages. [Visit Live Demo](https://jeffliuai.github.io/ran-neural-receiver-demo/) (Update with your actual URL)

---
Developed for 6G AI-RAN technical demonstration and educational purposes.
