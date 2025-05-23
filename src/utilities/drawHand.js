// Utility function to draw hand landmarks on canvas with enhanced visibility
export const drawHand = (predictions, ctx) => {
  
  // Check if we have predictions
  if (predictions.length > 0) {
    // Loop through each prediction
    predictions.forEach((prediction) => {
      // Grab landmarks
      const landmarks = prediction.landmarks;

      // Get current time for animation effects
      const time = Date.now() / 1000;
      
      // Draw connections between points first (so they appear behind the points)
      const fingerJoints = [
        // Thumb
        [0, 1], [1, 2], [2, 3], [3, 4],
        // Index finger
        [0, 5], [5, 6], [6, 7], [7, 8],
        // Middle finger
        [0, 9], [9, 10], [10, 11], [11, 12],
        // Ring finger
        [0, 13], [13, 14], [14, 15], [15, 16],
        // Pinky
        [0, 17], [17, 18], [18, 19], [19, 20],
        // Palm
        [0, 5], [5, 9], [9, 13], [13, 17]
      ];
      
      // Draw palm area with animated gradient for better visibility
      ctx.beginPath();
      ctx.moveTo(landmarks[0][0], landmarks[0][1]); // Palm base
      ctx.lineTo(landmarks[5][0], landmarks[5][1]); // Index base
      ctx.lineTo(landmarks[9][0], landmarks[9][1]); // Middle base
      ctx.lineTo(landmarks[13][0], landmarks[13][1]); // Ring base
      ctx.lineTo(landmarks[17][0], landmarks[17][1]); // Pinky base
      ctx.closePath();
      
      // Create animated gradient fill for palm
      const palmCenterX = (landmarks[0][0] + landmarks[9][0]) / 2;
      const palmCenterY = (landmarks[0][1] + landmarks[9][1]) / 2;
      const palmGradient = ctx.createRadialGradient(
        palmCenterX, palmCenterY, 10,
        palmCenterX, palmCenterY, 100
      );
      
      // Animate gradient colors with more vibrant neon effect
      const hue1 = (time * 20) % 360;
      const hue2 = (hue1 + 60) % 360;
      
      palmGradient.addColorStop(0, `hsla(${hue1}, 100%, 60%, 0.4)`);
      palmGradient.addColorStop(1, `hsla(${hue2}, 100%, 50%, 0.1)`);
      
      ctx.fillStyle = palmGradient;
      ctx.fill();
      
      // Add glow effect to entire hand
      ctx.shadowColor = `hsla(${hue1}, 100%, 70%, 0.8)`;
      ctx.shadowBlur = 20;
      
      // Loop through finger joints and draw connections with animated effects
      for (let i = 0; i < fingerJoints.length; i++) {
        const [start, end] = fingerJoints[i];
        
        // Calculate pulsing width based on time
        const pulseEffect = 1 + 0.2 * Math.sin(time * 3 + i * 0.2);
        
        // Draw path with enhanced glow effect
        // Outer glow
        ctx.beginPath();
        ctx.moveTo(landmarks[start][0], landmarks[start][1]);
        ctx.lineTo(landmarks[end][0], landmarks[end][1]);
        ctx.strokeStyle = `hsla(${(hue1 + i * 5) % 360}, 100%, 60%, 0.8)`;
        ctx.lineWidth = 12 * pulseEffect;
        ctx.stroke();
        
        // Inner line
        ctx.beginPath();
        ctx.moveTo(landmarks[start][0], landmarks[start][1]);
        ctx.lineTo(landmarks[end][0], landmarks[end][1]);
        ctx.strokeStyle = `hsla(${(hue2 + i * 5) % 360}, 100%, 90%, 1.0)`;
        ctx.lineWidth = 5 * pulseEffect;
        ctx.stroke();
      }
      
      // Reset shadow for better performance
      ctx.shadowBlur = 0;
      
      // Loop through fingers and draw points with enhanced visibility
      for (let i = 0; i < landmarks.length; i++) {
        const point = landmarks[i];
        
        // Calculate pulsing size based on time
        const pulseSize = 1 + 0.3 * Math.sin(time * 2 + i * 0.1);
        
        // Draw glow effect
        ctx.beginPath();
        
        // Set color based on which part of the hand
        if (i === 0) {
          // Palm base - larger, different color
          ctx.fillStyle = `hsla(${(hue1 + 120) % 360}, 100%, 70%, 0.8)`;
          ctx.arc(point[0], point[1], 18 * pulseSize, 0, 3 * Math.PI);
        } else if (i === 4 || i === 8 || i === 12 || i === 16 || i === 20) {
          // Fingertips - highlight with brighter color
          const fingerHue = (hue1 + i * 15) % 360;
          ctx.fillStyle = `hsla(${fingerHue}, 100%, 70%, 0.8)`;
          ctx.arc(point[0], point[1], 14 * pulseSize, 0, 3 * Math.PI);
        } else {
          // Other points
          ctx.fillStyle = `hsla(${hue2}, 90%, 80%, 0.8)`;
          ctx.arc(point[0], point[1], 10 * pulseSize, 0, 3 * Math.PI);
        }
        
        ctx.fill();
        
        // Draw inner point for better visibility
        ctx.beginPath();
        
        if (i === 0) {
          // Palm base
          ctx.fillStyle = `hsla(${(hue1 + 120) % 360}, 100%, 90%, 1.0)`;
          ctx.arc(point[0], point[1], 9 * pulseSize, 0, 3 * Math.PI);
        } else if (i === 4 || i === 8 || i === 12 || i === 16 || i === 20) {
          // Fingertips
          const fingerHue = (hue1 + i * 15) % 360;
          ctx.fillStyle = `hsla(${fingerHue}, 100%, 90%, 1.0)`;
          ctx.arc(point[0], point[1], 7 * pulseSize, 0, 3 * Math.PI);
        } else {
          // Other points
          ctx.fillStyle = "rgba(255, 255, 255, 1.0)";
          ctx.arc(point[0], point[1], 5 * pulseSize, 0, 3 * Math.PI);
        }
        
        ctx.fill();
      }
    });
  } else {
    console.log('No hand predictions found');
  }
}; 