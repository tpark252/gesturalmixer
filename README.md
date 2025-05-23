# GesturalMixer

A DJ mixing application with hand gesture controls powered by machine learning. Control your music with intuitive hand movements captured through your webcam.

## Features

- **Hand Gesture Controls**: Control various audio parameters using intuitive hand gestures
  - 🤘 Rock on/horns gesture (index + pinky): Volume control
  - ☝️ Index finger only: Low EQ control
  - ✌️ Peace sign: High EQ control
  - ✊ Closed fist: Reverb control
  - 🖐️ Open palm: All controls mode
  
- **Real-time Audio Visualization**: Beautiful 3D visualization that responds to your music
- **Multiple Audio Sources**: Load tracks from local files or Spotify (Premium account required)
- **Professional Audio Processing**: High-quality EQ and reverb effects

## Technologies Used

- React.js for the user interface
- TensorFlow.js and Handpose for hand gesture recognition
- Three.js for 3D audio visualization
- Tone.js for audio processing and effects
- WebGL shaders for advanced visual effects

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- Modern web browser with WebGL support
- Webcam access
- (Optional) Spotify Premium account for Spotify integration

### Installation

1. Clone this repository
```bash
git clone https://github.com/yourusername/gesturalmixer.git
cd gesturalmixer
```

2. Install dependencies
```bash
npm install
```

3. Start the development server
```bash
npm start
```

4. Open your browser and navigate to `http://localhost:3000`

## Usage

1. Allow camera access when prompted
2. Load a track using either local file or Spotify options
3. Use hand gestures to control the mix:
   - Move your hand horizontally from left (low) to right (high) to adjust parameters
   - Change gestures to control different parameters

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- TensorFlow.js team for the hand pose detection model
- Three.js community for the 3D visualization libraries
- Tone.js for the audio processing capabilities
