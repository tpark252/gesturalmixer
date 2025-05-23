import React, { useState, useEffect, useRef } from 'react';
import { Camera, Volume2, Zap, Music, Play, Pause, File } from 'lucide-react';
import * as Tone from 'tone';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-cpu';
import * as handpose from '@tensorflow-models/handpose';
import { drawHand } from './utilities/drawHand';
import ThreeAudioVisualizer from './components/ThreeAudioVisualizer';

let player = null;
let masterVolume = null;
let lowEQ = null;
let midEQ = null;
let highEQ = null;
let reverb = null;

const GestureDJMixer = () => {
  // Core state
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [handDetected, setHandDetected] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [model, setModel] = useState(null);
  const [audioInitialized, setAudioInitialized] = useState(false);
  
  // UI state
  const [showGestureGuide, setShowGestureGuide] = useState(false);
  
  // Audio controls
  const [volume, setVolume] = useState(75);
  const [lowGain, setLowGain] = useState(0);
  const [midGain, setMidGain] = useState(0);
  const [highGain, setHighGain] = useState(0);
  const [reverbMix, setReverbMix] = useState(0);
  const [activeControl, setActiveControl] = useState('all'); // 'volume', 'lowEQ', 'midEQ', 'highEQ', 'reverb', 'all'
  
  // Track state
  const [track, setTrack] = useState({
    name: "No track loaded",
    artist: "",
    duration: "0:00",
    loaded: false,
    playing: false,
    uri: null
  });
  
  // Spotify modal
  const [showSpotifyModal, setShowSpotifyModal] = useState(false);
  const [spotifyToken, setSpotifyToken] = useState('');
  const [spotifyError, setSpotifyError] = useState('');
  const [spotifyDeviceId, setSpotifyDeviceId] = useState(null);
  const [spotifyPlayer, setSpotifyPlayer] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  
  // Audio visualization
  const [audioAnalyser, setAudioAnalyser] = useState(null);
  
  // Refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const setupVideoContainerRef = useRef(null); // Container for video and canvas
  const animationFrameRef = useRef(null);
  const streamRef = useRef(null);
  
  // Local file state
  const [localFile, setLocalFile] = useState(null);
  const fileInputRef = useRef(null);
  
  // Initialize TensorFlow.js
  useEffect(() => {
    const initializeTensorFlow = async () => {
      try {
        console.log('Initializing TensorFlow.js...');
        
        // Register backends
        await tf.ready();
        
        // Try WebGL first, then CPU as fallback
        const backendNames = ['webgl', 'cpu'];
        let backendSet = false;
        
        for (const backendName of backendNames) {
          try {
            console.log(`Trying to set ${backendName} backend...`);
            await tf.setBackend(backendName);
            backendSet = true;
            console.log(`Successfully set ${backendName} backend`);
            break;
          } catch (err) {
            console.warn(`Failed to set ${backendName} backend:`, err);
          }
        }
        
        if (!backendSet) {
          console.error('Failed to set any TensorFlow.js backend');
        } else {
          console.log('TensorFlow.js initialized with backend:', tf.getBackend());
        }
      } catch (err) {
        console.error('Error initializing TensorFlow.js:', err);
      }
    };
    
    initializeTensorFlow();
  }, []);

  // Initialize video element
  useEffect(() => {
    console.log('Setup video container ref:', setupVideoContainerRef.current);
    
    if (!setupVideoContainerRef.current) {
      console.error('Setup video container ref is null');
      return;
    }
    
    // Create video element
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'cover';
    video.style.borderRadius = '8px';
    video.style.display = 'block'; // Ensure video is visible
    video.style.opacity = '1'; // Make sure video is visible
    video.style.zIndex = '1'; // Lower z-index than canvas
    videoRef.current = video;
    
    if (setupVideoContainerRef.current) {
      setupVideoContainerRef.current.appendChild(video);
      console.log('Video element added to setup container');
    }
    
    // Then setup webcam AFTER video element is ready
    setupWebcam();
  }, []);
  

  // Initialize audio system
  const initializeAudio = async () => {
    if (audioInitialized) return;
    
    try {
      await Tone.start();
      
      // Create master volume
      masterVolume = new Tone.Volume(0);
      
      // Create EQ filters with proper types for EQ control
      lowEQ = new Tone.Filter({
        frequency: 320,
        type: "lowshelf",
        gain: 0,
        Q: 1
      });
      
      midEQ = new Tone.Filter({
        frequency: 1000,
        type: "peaking",
        gain: 0,
        Q: 1
      });
      
      highEQ = new Tone.Filter({
        frequency: 3200,
        type: "highshelf",
        gain: 0,
        Q: 1
      });
      
      // Create reverb effect
      reverb = new Tone.Reverb({
        decay: 2.5,
        preDelay: 0.1,
        wet: 0
      }).toDestination();
      
      // Create proper audio chain: filters -> master volume -> reverb -> destination
      lowEQ.connect(masterVolume);
      midEQ.connect(masterVolume);
      highEQ.connect(masterVolume);
      masterVolume.connect(reverb);
      
      // Set up audio analyzer for visualization
      const analyser = Tone.getContext().createAnalyser();
      analyser.fftSize = 1024; // Higher resolution for better visualization
      reverb.connect(analyser);
      setAudioAnalyser(analyser);
      
      setAudioInitialized(true);
      console.log('Audio system initialized with proper EQ and reverb routing');
    } catch (err) {
      console.error('Failed to initialize audio:', err);
    }
  };

  // Load HandPose model
  const loadHandposeModel = async () => {
    try {
      setLoadingStatus('Loading hand detection model...');
      
      // Test the drawHand function to make sure it's working
      testDrawHandFunction();
      
      console.log('Loading handpose model...');
      const handposeModel = await handpose.load({
        modelType: 'lite',
        detectionConfidence: 0.5
      });
      console.log('Handpose model loaded successfully:', handposeModel);
      setModel(handposeModel);
      setLoadingStatus('Hand detection ready');
      return handposeModel;
    } catch (err) {
      console.error('Failed to load handpose model:', err);
      console.error('Error details:', err.message, err.stack);
      setLoadingStatus('Failed to load hand detection: ' + err.message);
      return null;
    }
  };
  
  // Test function to check if drawHand is working
  const testDrawHandFunction = () => {
    try {
      console.log('Testing drawHand function...');
      // Create a test canvas
      const testCanvas = document.createElement('canvas');
      testCanvas.width = 200;
      testCanvas.height = 200;
      const ctx = testCanvas.getContext('2d');
      
      // Create mock hand data
      const mockHands = [
        {
          landmarks: Array(21).fill().map(() => [100, 100, 0])
        }
      ];
      
      // Try to call drawHand
      console.log('Calling drawHand with mock data...');
      drawHand(mockHands, ctx);
      console.log('drawHand test completed successfully');
    } catch (err) {
      console.error('Error testing drawHand function:', err);
      console.error('Error details:', err.message, err.stack);
    }
  };

  // Setup webcam using native getUserMedia API
  const setupWebcam = async () => {
    try {
      setLoadingStatus('Requesting camera access...');
      
      // Make sure setup container exists
      if (!setupVideoContainerRef.current) {
        console.error('Setup video container is null');
        return;
      }
      
      // Clear any existing elements
      while (setupVideoContainerRef.current.firstChild) {
        setupVideoContainerRef.current.removeChild(setupVideoContainerRef.current.firstChild);
      }
      
      // Create video element first
      const video = document.createElement('video');
      video.id = 'webcam';
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'cover';
      video.style.borderRadius = '8px';
      video.style.position = 'absolute';
      video.style.zIndex = '1';
      video.style.backgroundColor = '#000';
      
      // Create canvas element second
      const canvas = document.createElement('canvas');
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.zIndex = '2';
      canvas.style.pointerEvents = 'none';
      canvas.style.background = 'transparent';
      
      // Add video first, then canvas (order matters for z-index stacking context)
      setupVideoContainerRef.current.appendChild(video);
      setupVideoContainerRef.current.appendChild(canvas);
      console.log('Video and canvas elements created and added to container in correct order');
      
      // Store references
      videoRef.current = video;
      canvasRef.current = canvas;
      
      // Set initial canvas dimensions
      canvas.width = setupVideoContainerRef.current.offsetWidth;
      canvas.height = setupVideoContainerRef.current.offsetHeight;
      
      // Get camera stream
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: { ideal: 640 },
            height: { ideal: 480 }
          } 
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream; // Store for cleanup
          console.log('Camera stream attached to video element');
        }
      } catch (streamError) {
        console.error('Failed to get camera stream:', streamError);
        setLoadingStatus(`Camera stream error: ${streamError.message}`);
        return;
      }
      
      // Wait for video to be ready
      try {
        await new Promise((resolve, reject) => {
          if (!videoRef.current) {
            reject(new Error('Video element not found'));
            return;
          }
          
          videoRef.current.onloadedmetadata = resolve;
          // Set a timeout in case the event never fires
          setTimeout(() => reject(new Error('Video metadata load timeout')), 5000);
        });
        
        if (videoRef.current) {
          await videoRef.current.play();
          console.log('Video playback started');
        }
      } catch (videoError) {
        console.error('Video setup error:', videoError);
        setLoadingStatus(`Video setup error: ${videoError.message}`);
        return;
      }
      
      // Make sure the container has position relative for absolute positioning to work
      setupVideoContainerRef.current.style.position = 'relative';
      
      // Load hand detection model
      const model = await loadHandposeModel();
      if (model) {
        startHandDetection(model);
        console.log('Hand detection started');
      } else {
        console.error('Failed to load handpose model');
        setLoadingStatus('Failed to load hand detection model');
      }
      
      // Initialize audio
      await initializeAudio();
      
      // Set setup complete
      setIsSetupComplete(true);
      setLoadingStatus('Setup complete');
      
    } catch (error) {
      console.error('Camera access failed:', error);
      setLoadingStatus(`Camera error: ${error.message}`);
    }
  };

  // Hand detection and gesture processing
  const startHandDetection = (handposeModel) => {
    if (!handposeModel) {
      console.error('No handpose model provided to startHandDetection');
      return;
    }
    
    console.log('Starting hand detection with model:', handposeModel);
    
    const detectHands = async () => {
      try {
        if (!videoRef.current || !canvasRef.current) {
          console.log('Video or canvas not ready yet');
          animationFrameRef.current = requestAnimationFrame(detectHands);
          return;
        }
        
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        
        // Make sure video dimensions are available
        if (video.videoWidth === 0 || video.videoHeight === 0) {
          console.log('Video dimensions not available yet, waiting...');
          animationFrameRef.current = requestAnimationFrame(detectHands);
          return;
        }
        
        // Set canvas dimensions to match video dimensions exactly
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          console.log('Updated canvas dimensions to match video:', canvas.width, 'x', canvas.height);
        }
        
        // Clear the entire canvas with transparency
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Make detections
        const hands = await handposeModel.estimateHands(video);
        
        if (hands && hands.length > 0) {
          setHandDetected(true);
          
          // Draw the hand skeleton
          drawHand(hands, ctx);
          
          // Process gestures for audio control
          processGestures(hands[0], video.videoWidth, video.videoHeight);
        } else {
          setHandDetected(false);
          // No guidance text - keep the canvas clear
        }
      } catch (err) {
        console.error('Hand detection error:', err);
        console.error('Error details:', err.message, err.stack);
      }
      
      // Always continue the detection loop
      animationFrameRef.current = requestAnimationFrame(detectHands);
    };
    
    // Start the detection loop
    detectHands();
  };

  // Helper functions for hand gesture detection
  const isFingerExtended = (landmarks, fingerIndex) => {
    // For thumb (which works differently)
    if (fingerIndex === 0) {
      const thumbCmc = landmarks[1];
      const thumbMcp = landmarks[2];
      const thumbIp = landmarks[3];
      const thumbTip = landmarks[4];
      
      // Check if thumb is extended to the side
      // Make this more lenient
      const isExtended = thumbTip[0] < thumbIp[0] - 5;
      return isExtended;
    }
    
    // For other fingers, get the joints
    const mcpJoint = fingerIndex * 4 + 1; // Base of finger
    const pipJoint = fingerIndex * 4 + 2; // Middle joint
    const tipJoint = fingerIndex * 4 + 4; // Tip of finger
    
    // Get the y coordinates
    const baseY = landmarks[mcpJoint][1];
    const tipY = landmarks[tipJoint][1];
    
    // Finger is extended if tip is higher (lower Y value) than base by a threshold
    // Making this more lenient (20 pixels instead of 30)
    return tipY < baseY - 20;
  };
  
  // Simplified gesture detection with more robust checks
  const detectGesture = (landmarks) => {
    // Check which fingers are extended
    const thumbExtended = isFingerExtended(landmarks, 0);
    const indexExtended = isFingerExtended(landmarks, 1);
    const middleExtended = isFingerExtended(landmarks, 2);
    const ringExtended = isFingerExtended(landmarks, 3);
    const pinkyExtended = isFingerExtended(landmarks, 4);
    
    // Log finger states for debugging
    console.log(`Fingers extended: Thumb=${thumbExtended}, Index=${indexExtended}, Middle=${middleExtended}, Ring=${ringExtended}, Pinky=${pinkyExtended}`);
    
    // Simplified gesture detection with clearer patterns
    
    // Rock on/horns gesture - index and pinky extended, others closed (for volume)
    if (!thumbExtended && indexExtended && !middleExtended && !ringExtended && pinkyExtended) {
      console.log("Detected: Rock on/horns gesture (volume)");
      return 'volume';
    }
    
    // Index finger only (for low EQ)
    if (!thumbExtended && indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
      console.log("Detected: Index finger only (low EQ)");
      return 'lowEQ';
    }
    
    // Peace sign - index and middle fingers (for high EQ)
    if (!thumbExtended && indexExtended && middleExtended && !ringExtended && !pinkyExtended) {
      console.log("Detected: Peace sign (high EQ)");
      return 'highEQ';
    }
    
    // Fist - no fingers extended (for reverb)
    if (!thumbExtended && !indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
      console.log("Detected: Fist (reverb)");
      return 'reverb';
    }
    
    // Open palm - all fingers extended (for all controls mode)
    if (thumbExtended && indexExtended && middleExtended && ringExtended && pinkyExtended) {
      console.log("Detected: Open palm (all controls mode)");
      return 'all';
    }
    
    // No recognized gesture
    return null;
  };

  // Process hand gestures for audio control
  const processGestures = (hand, videoWidth, videoHeight) => {
    const landmarks = hand.landmarks;
    
    // Detect current gesture
    const gesture = detectGesture(landmarks);
    
    // Update active control if gesture changed and is valid
    if (gesture && gesture !== activeControl) {
      setActiveControl(gesture);
      console.log(`Active control changed to: ${gesture}`);
    }
    
    // If no valid gesture or no active control, do nothing
    if (!activeControl) return;
    
    // Get palm position
    const palmX = landmarks[0][0];
    
    // Normalize X coordinate (0 to 1)
    const normalizedX = palmX / videoWidth; // 0 (left) to 1 (right)
    
    // Handle each control mode separately
    if (activeControl === 'volume') {
      const newVolume = Math.max(0, Math.min(100, normalizedX * 100));
      setVolume(Math.round(newVolume));
      console.log(`Setting volume to ${Math.round(newVolume)}%`);
    } 
    else if (activeControl === 'lowEQ') {
      const lowLevel = Math.max(-12, Math.min(12, (normalizedX * 24) - 12));
      setLowGain(Math.round(lowLevel));
      console.log(`Setting low EQ to ${Math.round(lowLevel)}dB`);
    } 
    else if (activeControl === 'highEQ') {
      const highLevel = Math.max(-12, Math.min(12, (normalizedX * 24) - 12));
      setHighGain(Math.round(highLevel));
      console.log(`Setting high EQ to ${Math.round(highLevel)}dB`);
    } 
    else if (activeControl === 'reverb') {
      const reverbLevel = Math.max(0, Math.min(1, normalizedX));
      setReverbMix(Math.round(reverbLevel * 100) / 100);
      console.log(`Setting reverb to ${Math.round(reverbLevel * 100)}%`);
    }
    else if (activeControl === 'all') {
      // In "all" mode, we'll use the same gesture detection logic
      // to determine which control to adjust
      const thumbExtended = isFingerExtended(landmarks, 0);
      const indexExtended = isFingerExtended(landmarks, 1);
      const middleExtended = isFingerExtended(landmarks, 2);
      const ringExtended = isFingerExtended(landmarks, 3);
      const pinkyExtended = isFingerExtended(landmarks, 4);
      
      // Rock on/horns gesture - index and pinky extended, others closed (for volume)
      if (!thumbExtended && indexExtended && !middleExtended && !ringExtended && pinkyExtended) {
        const allVolume = Math.max(0, Math.min(100, normalizedX * 100));
        setVolume(Math.round(allVolume));
        console.log(`All mode: Setting volume to ${Math.round(allVolume)}%`);
      }
      // Index finger only (for low EQ)
      else if (!thumbExtended && indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
        const allLowEQ = Math.max(-12, Math.min(12, (normalizedX * 24) - 12));
        setLowGain(Math.round(allLowEQ));
        console.log(`All mode: Setting low EQ to ${Math.round(allLowEQ)}dB`);
      }
      // Peace sign - index and middle fingers (for high EQ)
      else if (!thumbExtended && indexExtended && middleExtended && !ringExtended && !pinkyExtended) {
        const allHighEQ = Math.max(-12, Math.min(12, (normalizedX * 24) - 12));
        setHighGain(Math.round(allHighEQ));
        console.log(`All mode: Setting high EQ to ${Math.round(allHighEQ)}dB`);
      }
      // Fist - no fingers extended (for reverb)
      else if (!thumbExtended && !indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
        const allReverb = Math.max(0, Math.min(1, normalizedX));
        setReverbMix(Math.round(allReverb * 100) / 100);
        console.log(`All mode: Setting reverb to ${Math.round(allReverb * 100)}%`);
      }
    }
  };

  // Update audio parameters
  useEffect(() => {
    if (!audioInitialized) return;
    
    if (masterVolume) {
      console.log(`Setting volume to ${volume}% (${Tone.gainToDb(volume / 100)}dB)`);
      masterVolume.volume.value = Tone.gainToDb(volume / 100);
    }
  }, [volume, audioInitialized]);

  useEffect(() => {
    if (!audioInitialized) return;
    
    if (lowEQ) {
      console.log(`Setting low EQ to ${lowGain}dB`);
      lowEQ.gain.value = lowGain;
    }
    
    if (midEQ) {
      console.log(`Setting mid EQ to ${midGain}dB`);
      midEQ.gain.value = midGain;  
    }
    
    if (highEQ) {
      console.log(`Setting high EQ to ${highGain}dB`);
      highEQ.gain.value = highGain;
    }
  }, [lowGain, midGain, highGain, audioInitialized]);

  useEffect(() => {
    if (!audioInitialized || !reverb) return;
    
    console.log(`Setting reverb mix to ${reverbMix * 100}%`);
    reverb.wet.value = reverbMix;
  }, [reverbMix, audioInitialized]);

  // Start visualizer when audio is initialized
  useEffect(() => {
    if (audioInitialized) {
      // No need to call draw3DVisualizer as it's handled by ThreeAudioVisualizer component
    }
    
    return () => {
      // No need to clean up animation frame as it's handled by ThreeAudioVisualizer component
    };
  }, [audioInitialized]);

  // Initialize Spotify Web SDK
  useEffect(() => {
    // Load Spotify Web Playback SDK script
    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    document.body.appendChild(script);

    // Initialize Spotify Player when SDK is ready
    window.onSpotifyWebPlaybackSDKReady = () => {
      if (!spotifyToken) return;
      
      const player = new window.Spotify.Player({
        name: 'HandMix DJ Player',
        getOAuthToken: cb => { cb(spotifyToken); },
        volume: volume / 100
      });

      // Error handling
      player.addListener('initialization_error', ({ message }) => {
        console.error('Spotify initialization error:', message);
        setSpotifyError('Failed to initialize Spotify player: ' + message);
      });

      player.addListener('authentication_error', ({ message }) => {
        console.error('Spotify authentication error:', message);
        setSpotifyError('Spotify authentication failed: ' + message);
      });

      player.addListener('account_error', ({ message }) => {
        console.error('Spotify account error:', message);
        setSpotifyError('Spotify Premium required: ' + message);
      });

      // Ready
      player.addListener('ready', ({ device_id }) => {
        console.log('Spotify player ready with device ID:', device_id);
        setSpotifyDeviceId(device_id);
        setSpotifyPlayer(player);
      });

      // Track changed
      player.addListener('player_state_changed', state => {
        if (!state) return;
        
        const currentTrack = state.track_window.current_track;
        setTrack({
          name: currentTrack.name,
          artist: currentTrack.artists.map(a => a.name).join(', '),
          duration: formatDuration(currentTrack.duration_ms),
          loaded: true,
          playing: !state.paused,
          uri: currentTrack.uri
        });
      });

      player.connect();
      setSpotifyPlayer(player);
    };

    return () => {
      if (spotifyPlayer) {
        spotifyPlayer.disconnect();
      }
    };
  }, [spotifyToken]);

  // Format duration from milliseconds to MM:SS
  const formatDuration = (ms) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  // Search Spotify
  const searchSpotify = async () => {
    if (!searchQuery.trim() || !spotifyToken) return;
    
    try {
      const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=track&limit=10`, {
        headers: {
          'Authorization': `Bearer ${spotifyToken}`
        }
      });
      
      const data = await response.json();
      if (data.error) {
        setSpotifyError(data.error.message);
        return;
      }
      
      setSearchResults(data.tracks.items);
    } catch (err) {
      console.error('Spotify search error:', err);
      setSpotifyError('Failed to search Spotify: ' + err.message);
    }
  };

  // Play a track
  const playTrack = async (uri) => {
    if (!spotifyDeviceId || !spotifyToken) {
      setSpotifyError('Spotify player not ready');
      return;
    }
    
    try {
      await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${spotifyDeviceId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${spotifyToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          uris: [uri]
        })
      });
      
      setShowSpotifyModal(false);
    } catch (err) {
      console.error('Failed to play track:', err);
      setSpotifyError('Failed to play track: ' + err.message);
    }
  };

  // Handle local file selection
  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    // Initialize audio if not already done
    if (!audioInitialized) {
      initializeAudio().then(() => loadLocalFile(file));
    } else {
      loadLocalFile(file);
    }
  };
  
  // Load and play local audio file
  const loadLocalFile = (file) => {
    const fileURL = URL.createObjectURL(file);
    
    // Stop any currently playing track
    if (player) {
      player.stop();
      player.disconnect();
    }
    
    // Create new player with the file
    player = new Tone.Player({
      url: fileURL,
      autostart: false,
      onload: () => {
        console.log('Local file loaded');
        
        // Connect player to each EQ filter in parallel
        player.fan(lowEQ, midEQ, highEQ);
        
        // Update track info
        setTrack({
          name: file.name.replace(/\.[^/.]+$/, ""), // Remove file extension
          artist: 'Local File',
          duration: formatDuration(player.buffer.duration * 1000),
          loaded: true,
          playing: false,
          uri: null
        });
        
        setLocalFile(file);
        console.log('Audio routing complete: Player -> [Low/Mid/High EQ] -> Master Volume -> Reverb -> Destination');
      },
      onerror: (err) => {
        console.error('Error loading audio file:', err);
      }
    });
  };
  
  // Play/pause local file
  const toggleLocalPlayback = () => {
    if (!player || !track.loaded) return;
    
    try {
      if (track.playing) {
        console.log('Stopping playback');
        player.stop();
        setTrack(prev => ({ ...prev, playing: false }));
      } else {
        console.log('Starting playback');
        // Ensure proper connections before playing
        player.disconnect(); // Clear any existing connections
        player.fan(lowEQ, midEQ, highEQ); // Reconnect to EQ filters
        player.start();
        setTrack(prev => ({ ...prev, playing: true }));
        
        // Debug audio routing
        console.log('Audio routing check:');
        console.log('- Player connected to EQ filters');
        console.log(`- Volume: ${volume}% (${Tone.gainToDb(volume / 100)}dB)`);
        console.log(`- EQ settings: Low=${lowGain}dB, Mid=${midGain}dB, High=${highGain}dB`);
        console.log(`- Reverb mix: ${reverbMix * 100}%`);
      }
    } catch (err) {
      console.error('Local playback error:', err);
    }
  };

  // Modified toggle playback to handle both Spotify and local files
  const togglePlayback = () => {
    if (!track.loaded) return;
    
    try {
      if (localFile) {
        toggleLocalPlayback();
      } else if (spotifyPlayer) {
        if (track.playing) {
          spotifyPlayer.pause();
        } else {
          spotifyPlayer.resume();
        }
      }
    } catch (err) {
      console.error('Playback error:', err);
    }
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (streamRef.current) {
        const tracks = streamRef.current.getTracks();
        tracks.forEach(track => {
          track.stop();
          console.log('Camera track stopped');
        });
      }
    };
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <header style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '1rem 2rem',
        background: '#111',
        borderBottom: '1px solid #333'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', fontSize: '1.5rem', fontWeight: 'bold' }}>
          <Zap style={{ marginRight: '0.5rem', color: '#00ff88' }} size={28} />
          HandMix
        </div>
      </header>

      <main style={{ padding: '2rem' }}>
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center',
          minHeight: '60vh',
          background: '#111',
          borderRadius: '12px',
          padding: '2rem'
        }}>
          {!isSetupComplete ? (
            <>
              <Camera size={48} style={{ color: '#00ff88', marginBottom: '1rem' }} />
              <h2 style={{ marginBottom: '1rem' }}>Camera Access Required</h2>
              <p style={{ color: '#888', textAlign: 'center', marginBottom: '2rem' }}>
                HandMix needs camera access for gesture control
              </p>
              {loadingStatus && (
                <div style={{ margin: '1rem 0', color: '#00ff88' }}>
                  {loadingStatus}
                </div>
              )}
              <button 
                onClick={setupWebcam}
                style={{
                  background: '#00ff88',
                  color: '#000',
                  border: 'none',
                  padding: '12px 24px',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  cursor: 'pointer',
                  marginBottom: '20px'
                }}
              >
                Allow Camera Access
              </button>
            </>
          ) : (
            <>
              {/* Controls Display */}
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column',
                justifyContent: 'center',
                gap: '1rem', 
                marginBottom: '2rem',
                background: '#222',
                padding: '1.5rem',
                borderRadius: '12px',
                width: '100%',
                maxWidth: '800px'
              }}>
                {/* Parameter values */}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '2rem' }}>
                  <div style={{ 
                    textAlign: 'center',
                    opacity: activeControl === 'volume' || activeControl === 'all' ? 1 : 0.5
                  }}>
                    <div style={{ color: '#888', fontSize: '14px' }}>Volume</div>
                    <div style={{ fontSize: '24px', color: '#00ff88' }}>{volume}%</div>
                  </div>
                  <div style={{ 
                    textAlign: 'center',
                    opacity: activeControl === 'lowEQ' || activeControl === 'all' ? 1 : 0.5
                  }}>
                    <div style={{ color: '#888', fontSize: '14px' }}>Low EQ</div>
                    <div style={{ fontSize: '24px', color: '#ff6b6b' }}>{lowGain}dB</div>
                  </div>
                  <div style={{ 
                    textAlign: 'center',
                    opacity: activeControl === 'highEQ' || activeControl === 'all' ? 1 : 0.5
                  }}>
                    <div style={{ color: '#888', fontSize: '14px' }}>High EQ</div>
                    <div style={{ fontSize: '24px', color: '#45b7d1' }}>{highGain}dB</div>
                  </div>
                  <div style={{ 
                    textAlign: 'center',
                    opacity: activeControl === 'reverb' || activeControl === 'all' ? 1 : 0.5
                  }}>
                    <div style={{ color: '#888', fontSize: '14px' }}>Reverb</div>
                    <div style={{ fontSize: '24px', color: '#c792ea' }}>{Math.round(reverbMix * 100)}%</div>
                  </div>
                </div>
                
                {/* Direction indicator - show for all control modes */}
                <div style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  color: '#888',
                  fontSize: '14px',
                  marginTop: '0.5rem'
                }}>
                  <div>Low</div>
                  <div style={{ 
                    height: '2px', 
                    background: 'linear-gradient(to right, #555, #aaa)',
                    flexGrow: 1,
                    margin: '0 1rem'
                  }}></div>
                  <div>High</div>
                </div>

                {/* Help button for gesture guide */}
                <button 
                  onClick={() => setShowGestureGuide(!showGestureGuide)}
                  style={{
                    background: 'transparent',
                    border: '1px solid #555',
                    color: '#aaa',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    marginTop: '0.5rem',
                    cursor: 'pointer',
                    fontSize: '14px',
                    alignSelf: 'center'
                  }}
                >
                  {showGestureGuide ? 'Hide Gesture Guide' : 'Show Gesture Guide'}
                </button>
              </div>

              {/* Gesture Guide - Collapsible */}
              {showGestureGuide ? (
                <div style={{
                  background: '#333',
                  padding: '1rem',
                  borderRadius: '8px',
                  marginBottom: '2rem',
                  fontSize: '14px',
                  color: '#ccc',
                  maxWidth: '600px',
                  width: '100%'
                }}>
                  <div style={{ marginBottom: '0.5rem', fontWeight: 'bold', color: '#fff' }}>Hand Gesture Controls:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.75rem' }}>
                    <div>🤘 Rock on gesture (index + pinky): Volume</div>
                    <div>☝️ Index finger only: Low EQ</div>
                    <div>✌️ Peace sign: High EQ</div>
                    <div>✊ Closed fist: Reverb</div>
                    <div>🖐️ Open palm: All controls mode</div>
                  </div>
                  <div style={{ color: '#aaa', fontStyle: 'italic', marginBottom: '0.5rem' }}>
                    Move your hand left (low) to right (high) to adjust the selected control.
                  </div>
                  <div style={{ color: '#aaa', fontStyle: 'italic', borderTop: '1px solid #555', paddingTop: '0.5rem' }}>
                    <strong>All Controls Mode:</strong> When in "all controls" mode, use the same gestures to select which parameter to adjust:
                    <ul style={{ margin: '0.25rem 0 0 1rem', paddingLeft: '0.5rem' }}>
                      <li>🤘 Rock on gesture: Adjust volume</li>
                      <li>☝️ Index finger only: Adjust low EQ</li>
                      <li>✌️ Peace sign: Adjust high EQ</li>
                      <li>✊ Closed fist: Adjust reverb</li>
                    </ul>
                  </div>
                </div>
              ) : null}

              {/* Single Deck */}
              <div style={{ 
                background: '#222', 
                borderRadius: '12px', 
                padding: '1.5rem',
                maxWidth: '600px',
                width: '100%',
                marginBottom: '2rem'
              }}>
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{track.name}</div>
                  <div style={{ color: '#888' }}>{track.artist} • {track.duration}</div>
                </div>
                
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <button 
                    onClick={togglePlayback}
                    disabled={!track.loaded}
                    style={{
                      background: track.playing ? '#ff4444' : '#00ff88',
                      color: '#000',
                      border: 'none',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      cursor: track.loaded ? 'pointer' : 'not-allowed',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    {track.playing ? <Pause size={18} /> : <Play size={18} />}
                    {track.playing ? 'Pause' : 'Play'}
                  </button>
                  
                  <button 
                    onClick={() => setShowSpotifyModal(true)}
                    style={{
                      background: '#333',
                      color: '#fff',
                      border: 'none',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <Music size={18} />
                    Spotify
                  </button>
                  
                  <button 
                    onClick={() => fileInputRef.current.click()}
                    style={{
                      background: '#333',
                      color: '#fff',
                      border: 'none',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <File size={18} />
                    Local File
                  </button>
                  <input 
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    accept="audio/*"
                    style={{ display: 'none' }}
                  />
                </div>
              </div>
            </>
          )}
          
          {/* Webcam container - always present but only visible after setup */}
          <div 
            ref={setupVideoContainerRef} 
            style={{ 
              width: '640px', 
              height: '480px',
              position: 'relative',
              border: '1px solid #333',
              borderRadius: '8px',
              overflow: 'hidden',
              backgroundColor: 'transparent'
            }}
          >
          </div>
          
          {/* Three.js Visualizer - only shown after setup */}
          {isSetupComplete && (
            <div style={{ 
              background: '#222', 
              borderRadius: '12px', 
              padding: '1rem',
              width: '100%',
              maxWidth: '640px',
              height: '400px',
              marginTop: '2rem'
            }}>
              <ThreeAudioVisualizer 
                audioAnalyser={audioAnalyser} 
                isPlaying={track.playing} 
              />
            </div>
          )}
        </div>

        {/* Spotify Modal */}
        {showSpotifyModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div style={{
              background: '#111',
              padding: '2rem',
              borderRadius: '12px',
              minWidth: '500px',
              maxWidth: '90%',
              maxHeight: '90vh',
              overflow: 'auto'
            }}>
              <h2 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Music size={24} />
                Connect to Spotify
              </h2>
              
              {!spotifyToken ? (
                <>
                  <p style={{ marginBottom: '1rem', color: '#888' }}>
                    Enter your Spotify access token to connect your premium account
                  </p>
                  <input
                    type="text"
                    value={spotifyToken}
                    onChange={(e) => setSpotifyToken(e.target.value)}
                    placeholder="Paste your Spotify access token here"
                    style={{
                      width: '100%',
                      padding: '12px',
                      marginBottom: '1rem',
                      background: '#222',
                      border: '1px solid #444',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '16px'
                    }}
                  />
                </>
              ) : (
                <>
                  <div style={{ marginBottom: '1rem' }}>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search for a track..."
                      style={{
                        width: '100%',
                        padding: '12px',
                        marginBottom: '0.5rem',
                        background: '#222',
                        border: '1px solid #444',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '16px'
                      }}
                    />
                    <button
                      onClick={searchSpotify}
                      style={{
                        background: '#1DB954',
                        color: '#fff',
                        border: 'none',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                    >
                      Search
                    </button>
                  </div>
                  
                  {searchResults.length > 0 && (
                    <div style={{ 
                      maxHeight: '300px', 
                      overflowY: 'auto',
                      marginBottom: '1rem',
                      background: '#222',
                      borderRadius: '8px',
                      padding: '0.5rem'
                    }}>
                      {searchResults.map(track => (
                        <div 
                          key={track.id}
                          onClick={() => playTrack(track.uri)}
                          style={{
                            padding: '0.75rem',
                            borderBottom: '1px solid #333',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            borderRadius: '4px',
                            transition: 'background 0.2s',
                            ':hover': {
                              background: '#333'
                            }
                          }}
                        >
                          {track.album.images.length > 0 && (
                            <img 
                              src={track.album.images[track.album.images.length - 1].url} 
                              alt={track.album.name}
                              style={{ width: '40px', height: '40px', borderRadius: '4px' }}
                            />
                          )}
                          <div>
                            <div style={{ fontWeight: 'bold' }}>{track.name}</div>
                            <div style={{ fontSize: '14px', color: '#888' }}>
                              {track.artists.map(a => a.name).join(', ')} • {formatDuration(track.duration_ms)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
              
              {spotifyError && (
                <div style={{ color: '#ff4444', marginBottom: '1rem', fontSize: '14px' }}>
                  {spotifyError}
                </div>
              )}
              
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button 
                  onClick={() => setShowSpotifyModal(false)}
                  style={{
                    background: '#333',
                    color: '#fff',
                    border: 'none',
                    padding: '12px 24px',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default GestureDJMixer;