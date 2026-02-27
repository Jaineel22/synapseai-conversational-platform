import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

// Initialize Google GenAI with API key from environment variables
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const getGeminiAPIResponse = async (message) => {
    try {
        // Input validation
        if (!message || typeof message !== 'string') {
            throw new Error('Message must be a non-empty string');
        }

        if (!process.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY not found in environment variables');
        }

        console.log(`📤 Sending request to Gemini with message: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`);

        // Call Google GenAI with gemini-3-flash-preview model
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: message,
            // Optional: Add generation configuration
            // config: {
            //     temperature: 0.7,
            //     maxOutputTokens: 1000,
            //     topP: 0.8,
            //     topK: 40
            // }
        });

        // Extract and return the text response
        const reply = response.text;
        
        if (!reply) {
            throw new Error('Empty response received from Gemini');
        }

        console.log(`📥 Received response from Gemini: "${reply.substring(0, 50)}${reply.length > 50 ? '...' : ''}"`);
        
        return reply;

    } catch (err) {
        console.error("❌ Error in getGeminiAPIResponse:", err.message);
        
        // Handle specific error types
        if (err.message.includes('API key')) {
            throw new Error('Invalid or missing Gemini API key');
        } else if (err.message.includes('model')) {
            throw new Error('Gemini model not available. Check model name and API version');
        } else if (err.message.includes('fetch')) {
            throw new Error('Network error while calling Gemini API');
        } else {
            throw new Error(`Gemini API error: ${err.message}`);
        }
    }
}

export default getGeminiAPIResponse;