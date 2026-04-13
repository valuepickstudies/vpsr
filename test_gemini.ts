import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

async function testGemini() {
  console.log("Testing Gemini API (Managed Key)...");
  
  try {
    const ai = new GoogleGenAI({});
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
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
