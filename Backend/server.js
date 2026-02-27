import express from 'express';
import "dotenv/config";
import cors from "cors";
import mongoose from 'mongoose';
import chatRoutes from "./routes/chat.js";

const app = express();
const PORT = 8080;

app.use(express.json());
app.use(cors());

app.use("/api", chatRoutes);

app.listen(PORT, () => {
    console.log(`server running on ${PORT}`);
    connectDB();
});

const connectDB = async() => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected with Database!");
    } catch(err) {
        console.log("Failed to connect with Db", err);
    }
}

// Initialize Google GenAI with API key from environment variables
// const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// app.post("/test", async (req, res) => {
//     try {
//         // Extract the user message from request body
//         const userMessage = req.body.message;
        
//         if (!userMessage) {
//             return res.status(400).send({ error: "Message is required in request body" });
//         }

//         console.log(`Processing request with message: "${userMessage}"`);

//         // Call Google GenAI with gemini-3-flash-preview model
//         const response = await ai.models.generateContent({
//             model: "gemini-3-flash-preview",
//             contents: userMessage,
//             // Optional: Add generation config if needed
//             // config: {
//             //     temperature: 0.7,
//             //     maxOutputTokens: 800,
//             // }
//         });

//         // Extract the text response
//         const aiResponse = response.text;
        
//         console.log("Response received from Gemini");
//         console.log("AI Response:", aiResponse);

//         // Send response back to client
//         res.send({ 
//             success: true,
//             message: aiResponse,
//             model: "gemini-3-flash-preview"
//         });

//     } catch(err) {
//         console.error("Error calling Gemini API:", err);
        
//         // Send appropriate error response
//         res.status(500).send({ 
//             error: "Failed to generate content",
//             details: err.message 
//         });
//     }
// });

// // Optional: Add a health check endpoint
// app.get("/health", (req, res) => {
//     res.send({ status: "OK", model: "gemini-3-flash-preview" });
// });




// import { GoogleGenerativeAI } from "@google/generative-ai";
// import "dotenv/config";

// const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// const model = genAI.getGenerativeModel({
//   model: "gemini-3-flash-preview",
// });

// async function main() {
//   try {
//     const result = await model.generateContent(
//       "Joke on people having funny behaviour"
//     );

//     const text = result.response.text();
//     console.log(text);

//   } catch (error) {
//     console.error(error.message);
//   }
// }

// main();