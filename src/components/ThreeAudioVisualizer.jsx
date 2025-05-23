import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const ThreeAudioVisualizer = ({ audioAnalyser, isPlaying }) => {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const meshRef = useRef(null);
  const animationFrameRef = useRef(null);
  const clockRef = useRef(null);
  const uniformsRef = useRef(null);
  const composerRef = useRef(null);
  const mouseRef = useRef({ x: 0, y: 0 });

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Create scene, camera, and renderer
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    
    const camera = new THREE.PerspectiveCamera(
      45,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 0, 12);
    cameraRef.current = camera;
    
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    // Create clock for animation
    clockRef.current = new THREE.Clock();
    
    // Create uniforms for shaders
    const uniforms = {
      u_time: { value: 0.0 },
      u_frequency: { value: 0.0 },
      u_red: { value: 1.0 },
      u_green: { value: 0.5 },
      u_blue: { value: 1.0 }
    };
    uniformsRef.current = uniforms;
    
    // Create geometry and material
    const geometry = new THREE.IcosahedronGeometry(4, 20);
    
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      wireframe: true
    });
    
    // Create mesh
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    meshRef.current = mesh;
    
    // Set up post-processing
    const renderScene = new RenderPass(scene, camera);
    
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(containerRef.current.clientWidth, containerRef.current.clientHeight),
      0.6,    // strength - reduced from 0.8 to 0.6
      0.5,    // radius - increased from 0.4 to 0.5 for softer bloom
      0.7     // threshold - increased from 0.6 to 0.7 to reduce bloom on darker areas
    );
    
    const outputPass = new OutputPass();
    
    const composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);
    composer.addPass(outputPass);
    
    composerRef.current = composer;
    
    // Mouse movement for interactive camera
    const handleMouseMove = (event) => {
      const windowHalfX = window.innerWidth / 2;
      const windowHalfY = window.innerHeight / 2;
      mouseRef.current.x = (event.clientX - windowHalfX) / 100;
      mouseRef.current.y = (event.clientY - windowHalfY) / 100;
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    
    // Handle resize
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current || !composerRef.current) return;
      
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      
      rendererRef.current.setSize(width, height);
      composerRef.current.setSize(width, height);
    };
    
    window.addEventListener('resize', handleResize);
    
    // Start animation
    animate();
    
    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameRef.current);
      
      if (rendererRef.current && containerRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
      
      if (geometry) geometry.dispose();
      if (material) material.dispose();
      if (rendererRef.current) rendererRef.current.dispose();
    };
  }, []);
  
  // Update frequency data from audio analyzer
  useEffect(() => {
    if (!audioAnalyser || !uniformsRef.current) return;
    
    // Keep track of previous values for better transient detection
    const prevValues = {
      bass: 0,
      mid: 0,
      high: 0,
      average: 0
    };
    
    const updateFrequency = () => {
      if (!audioAnalyser) return;
      
      const dataArray = new Uint8Array(audioAnalyser.frequencyBinCount);
      audioAnalyser.getByteFrequencyData(dataArray);
      
      // Define frequency ranges more precisely
      const bassRange = Math.floor(dataArray.length * 0.08); // First 8% - deep bass
      const midLowRange = Math.floor(dataArray.length * 0.08);
      const midHighRange = Math.floor(dataArray.length * 0.3);
      
      // Calculate levels with focus on transients
      const bassLevel = dataArray.slice(0, bassRange).reduce((sum, val) => sum + val, 0) / bassRange / 256;
      const midLevel = dataArray.slice(midLowRange, midHighRange).reduce((sum, val) => sum + val, 0) 
                      / (midHighRange - midLowRange) / 256;
      const highLevel = dataArray.slice(midHighRange).reduce((sum, val) => sum + val, 0) 
                       / (dataArray.length - midHighRange) / 256;
      
      // Calculate average with more weight on bass
      const weightedAverage = (bassLevel * 0.6) + (midLevel * 0.3) + (highLevel * 0.1);
      
      // Detect transients (sudden increases in energy)
      const bassDelta = Math.max(0, bassLevel - prevValues.bass);
      const midDelta = Math.max(0, midLevel - prevValues.mid);
      const highDelta = Math.max(0, highLevel - prevValues.high);
      
      // Update previous values
      prevValues.bass = bassLevel;
      prevValues.mid = midLevel;
      prevValues.high = highLevel;
      
      // Use a minimum threshold
      const minThreshold = isPlaying ? 0.02 : 0.01;
      
      if (uniformsRef.current) {
        // Base frequency response - more controlled
        const baseResponse = Math.max(minThreshold, weightedAverage * 0.5);
        
        // Add transient boost for bass hits
        const transientBoost = bassDelta * 1.0;
        
        // Combine for final frequency value - more responsive to bass hits
        const targetFreq = baseResponse + transientBoost;
        
        // Smoother response for sustained sounds, slower response for transients
        const smoothingFactor = bassDelta > 0.05 ? 0.3 : 0.08;
        
        // Update frequency uniform with smoothing
        uniformsRef.current.u_frequency.value = uniformsRef.current.u_frequency.value + 
                                              (targetFreq - uniformsRef.current.u_frequency.value) * smoothingFactor;
        
        // Color updates - more subtle
        const redTarget = 0.5 + bassLevel * 0.4;
        const greenTarget = 0.2 + midLevel * 0.6;
        const blueTarget = 0.5 + highLevel * 0.4;
        
        // More subtle color changes
        const colorSmoothingFactor = 0.06;
        
        uniformsRef.current.u_red.value = uniformsRef.current.u_red.value + 
                                        (redTarget - uniformsRef.current.u_red.value) * colorSmoothingFactor;
        
        uniformsRef.current.u_green.value = uniformsRef.current.u_green.value + 
                                          (greenTarget - uniformsRef.current.u_green.value) * colorSmoothingFactor;
        
        uniformsRef.current.u_blue.value = uniformsRef.current.u_blue.value + 
                                         (blueTarget - uniformsRef.current.u_blue.value) * colorSmoothingFactor;
      }
    };
    
    const intervalId = setInterval(updateFrequency, 20);
    
    return () => clearInterval(intervalId);
  }, [audioAnalyser, isPlaying]);
  
  // Animation loop
  const animate = () => {
    if (!sceneRef.current || !cameraRef.current || !rendererRef.current || !uniformsRef.current || !composerRef.current) return;
    
    // Update time uniform for color cycling
    uniformsRef.current.u_time.value = clockRef.current.getElapsedTime();
    
    // Simple rotation
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.001;
    }
    
    // Render with post-processing
    composerRef.current.render();
    
    animationFrameRef.current = requestAnimationFrame(animate);
  };
  
  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: '100%', 
        height: '100%', 
        position: 'relative',
        borderRadius: '8px',
        overflow: 'hidden',
        background: 'transparent'
      }}
    />
  );
};

// Vertex shader with Perlin noise
const vertexShader = `
  // Perlin noise implementation
  vec3 mod289(vec3 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
  }
  
  vec4 mod289(vec4 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
  }
  
  vec4 permute(vec4 x) {
    return mod289(((x*34.0)+10.0)*x);
  }
  
  vec4 taylorInvSqrt(vec4 r) {
    return 1.79284291400159 - 0.85373472095314 * r;
  }
  
  vec3 fade(vec3 t) {
    return t*t*t*(t*(t*6.0-15.0)+10.0);
  }
  
  // Classic Perlin noise
  float pnoise(vec3 P, vec3 rep) {
    vec3 Pi0 = mod(floor(P), rep); // Integer part, modulo period
    vec3 Pi1 = mod(Pi0 + vec3(1.0), rep); // Integer part + 1, mod period
    Pi0 = mod289(Pi0);
    Pi1 = mod289(Pi1);
    vec3 Pf0 = fract(P); // Fractional part for interpolation
    vec3 Pf1 = Pf0 - vec3(1.0); // Fractional part - 1.0
    vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
    vec4 iy = vec4(Pi0.yy, Pi1.yy);
    vec4 iz0 = Pi0.zzzz;
    vec4 iz1 = Pi1.zzzz;
  
    vec4 ixy = permute(permute(ix) + iy);
    vec4 ixy0 = permute(ixy + iz0);
    vec4 ixy1 = permute(ixy + iz1);
  
    vec4 gx0 = ixy0 * (1.0 / 7.0);
    vec4 gy0 = fract(floor(gx0) * (1.0 / 7.0)) - 0.5;
    gx0 = fract(gx0);
    vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
    vec4 sz0 = step(gz0, vec4(0.0));
    gx0 -= sz0 * (step(0.0, gx0) - 0.5);
    gy0 -= sz0 * (step(0.0, gy0) - 0.5);
  
    vec4 gx1 = ixy1 * (1.0 / 7.0);
    vec4 gy1 = fract(floor(gx1) * (1.0 / 7.0)) - 0.5;
    gx1 = fract(gx1);
    vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
    vec4 sz1 = step(gz1, vec4(0.0));
    gx1 -= sz1 * (step(0.0, gx1) - 0.5);
    gy1 -= sz1 * (step(0.0, gy1) - 0.5);
  
    vec3 g000 = vec3(gx0.x,gy0.x,gz0.x);
    vec3 g100 = vec3(gx0.y,gy0.y,gz0.y);
    vec3 g010 = vec3(gx0.z,gy0.z,gz0.z);
    vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);
    vec3 g001 = vec3(gx1.x,gy1.x,gz1.x);
    vec3 g101 = vec3(gx1.y,gy1.y,gz1.y);
    vec3 g011 = vec3(gx1.z,gy1.z,gz1.z);
    vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);
  
    vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
    g000 *= norm0.x;
    g010 *= norm0.y;
    g100 *= norm0.z;
    g110 *= norm0.w;
    vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
    g001 *= norm1.x;
    g011 *= norm1.y;
    g101 *= norm1.z;
    g111 *= norm1.w;
  
    float n000 = dot(g000, Pf0);
    float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
    float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
    float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
    float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
    float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
    float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
    float n111 = dot(g111, Pf1);
  
    vec3 fade_xyz = fade(Pf0);
    vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
    vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
    float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x);
    return 2.2 * n_xyz;
  }
  
  uniform float u_time;
  uniform float u_frequency;
  uniform float u_red;
  uniform float u_green;
  uniform float u_blue;
  
  void main() {
    // Generate noise based on position and time with frequency influence
    float timeScale = 0.4 + u_frequency * 0.5; // Reduced from 0.5/2.0 to 0.4/1.5
    float noiseScale = 1.5 + u_frequency * 1.5; // Reduced from 3.0/5.0 to 2.5/3.5
    
    // Create more complex noise pattern by combining multiple noise functions
    float noise1 = pnoise(position + u_time * timeScale, vec3(3.0));
    float noise2 = pnoise(position * 0.5 - u_time * timeScale * 0.1, vec3(10.0)) * 0.5;
    
    // Combine noise patterns
    float noise = noise1 + noise2;
    
    // Calculate displacement with enhanced frequency response
    // Base displacement that's always present
    float baseDisplacement = 0.3 * noise; // Reduced from 0.1 to 0.08
    
    // Additional displacement based on audio frequency
    float audioDisplacement = u_frequency * 8.0 * noise; // Reduced from 5.0 to 3.5
    
    // Combine displacements
    float displacement = baseDisplacement + audioDisplacement;
    
    // Apply displacement along normal direction
    vec3 newPosition = position + normal * displacement;
    
    // Project to screen
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.5);
  }
`;

// Fragment shader for coloring
const fragmentShader = `
  uniform float u_red;
  uniform float u_green;
  uniform float u_blue;
  uniform float u_frequency;
  uniform float u_time;
  
  // Color cycling function - simplified
  vec3 getColorFromTime(float time) {
    // Define color array (6 colors to cycle through)
    vec3 color1 = vec3(1.0, 0.2, 0.5);  // Pink/magenta
    vec3 color2 = vec3(0.2, 0.8, 1.0);  // Cyan/blue
    vec3 color3 = vec3(1.0, 0.6, 0.0);  // Orange/amber
    vec3 color4 = vec3(0.0, 0.8, 0.4);  // Green
    vec3 color5 = vec3(0.6, 0.2, 1.0);  // Purple
    vec3 color6 = vec3(1.0, 0.4, 0.4);  // Coral/red
    
    // Time for one color (3 seconds)
    float colorTime = 3.0;
    
    // Calculate which color pair to use based on time
    float totalTime = mod(time, 18.0); // 6 colors * 3 seconds each = 18 second cycle
    
    // Determine which color pair we're transitioning between
    vec3 fromColor;
    vec3 toColor;
    
    if (totalTime < colorTime) {
      fromColor = color1;
      toColor = color2;
    } else if (totalTime < colorTime * 2.0) {
      fromColor = color2;
      toColor = color3;
    } else if (totalTime < colorTime * 3.0) {
      fromColor = color3;
      toColor = color4;
    } else if (totalTime < colorTime * 4.0) {
      fromColor = color4;
      toColor = color5;
    } else if (totalTime < colorTime * 5.0) {
      fromColor = color5;
      toColor = color6;
    } else {
      fromColor = color6;
      toColor = color1;
    }
    
    // Calculate blend factor (0 to 1) within the current color pair
    float blendFactor = mod(totalTime, colorTime) / colorTime;
    
    // Smooth the transition
    blendFactor = smoothstep(0.0, 1.0, blendFactor);
    
    // Return interpolated color
    return mix(fromColor, toColor, blendFactor);
  }
  
  void main() {
    // Get base color from time cycle
    vec3 baseColor = getColorFromTime(u_time);
    
    // Blend with frequency-based intensity
    float intensity = 0.7 + u_frequency * 0.3; // Changed from 0.6/0.4 to 0.7/0.3 for less variation
    vec3 color = baseColor * intensity;
    
    gl_FragColor = vec4(color, 1.0);
  }
`;

export default ThreeAudioVisualizer; 