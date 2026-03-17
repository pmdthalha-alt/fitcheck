class GPTBodyAnalyzer {
  constructor() {
    this.apiKey = 'YOUR_OPENAI_KEY'; // Add your OpenAI API key here
    this.conversation = [];
  }

  async quickPoseCheck(visibleJoints, bodySize) {
    const prompt = `
Pose validation:
Visible joints: ${visibleJoints}/33
Frame size: ${bodySize}px²

Say ONLY what problem (if any):
- "Full body not visible - move closer" 
- "Stand straighter for better pose"
- "Good pose detected"`;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 50
        })
      });
      
      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      return visibleJoints < 20 ? 'Full body not visible - move closer' : 'Good pose detected';
    }
  }

  async analyzePoseData(poseData, measurements) {
    const prompt = `
You are an expert body measurement AI. Analyze this pose data and measurements:

MEASUREMENTS:
Shoulder Width: ${measurements.shoulder}cm
Height: ${measurements.height}cm
Frame Size: ${measurements.size}

POSE DATA SUMMARY:
- Visible joints: ${poseData.length}
- Quality: High/Medium/Low based on visibility

Provide:
1. Accurate body type classification
2. Clothing fit recommendations (3 items) 
3. Styling tips for body shape
4. Any posture corrections needed

Be specific, realistic, and helpful.`;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 300
        })
      });
      
      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      return 'Analysis: Medium build. Recommendations: Fitted tops, straight-leg pants, standard sizes.';
    }
  }
}

// Usage in your app:
// const gpt = new GPTBodyAnalyzer();
// const analysis = await gpt.analyzePoseData(scanData, measurements);
// addMessage(analysis);

