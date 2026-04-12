import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

async function testGemini() {
  console.log("Testing Gemini API Key...");
  console.log("Key starts with:", process.env.GEMINI_API_KEY?.substring(0, 10));
  
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: "Say 'Hello, the API key works!'",
    });
    console.log("Success! Response from Gemini:");
    console.log(response.text);
  } catch (error: any) {
    console.error("Failed to call Gemini API:");
    console.error(error.message);
  }
}

testGemini();
