import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

const genAI = new GoogleGenAI({
  apiKey: process.env.GOOGLE_GEMINI_API_KEY,
});

export const parseResumeWithAI = async (resumeText) => {
  const fullPrompt = `
You're a resume parsing assistant. Extract the following structured data from the resume text and return it as a clean JSON object. 

Include ALL fields, even if they are empty or not present in the resume.

Return ONLY valid raw JSON (no explanation, markdown, or extra text). DO NOT use triple backticks or code blocks.

Expected structure:
{
  "fullName": "",
  "phone": "",
  "email": "",
  "education": [
    { "institution": "", "degree": "", "fieldOfStudy": "", "graduationYear": "", "gpa": "" }
  ],
  "workExperience": [
    { "jobTitle": "", "company": "", "employmentType": "", "startDate": "", "endDate": "", "isCurrentJob": false, "jobDescription": "", "achievements": [] }
  ],
  "technicalSkills": [],
  "softSkills": [],
  "tools": [],
  "languages": [],
  "certifications": [
    { "name": "", "issuingOrganization": "", "issueDate": "" }
  ],
  "achievements": [],
  "projects": [
    { "name": "", "description": "", "technologies": [], "link": "" }
  ],
  "linkedin": "",
  "github": ""
}

Resume Text:
${resumeText}
`.trim();

  try {
    const response = await genAI.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [{ text: fullPrompt }],
        },
      ],
    });

    let text = response?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    text = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error("No valid JSON object found in the AI response.");
    }

    const jsonStr = text.slice(firstBrace, lastBrace + 1).trim();

    const json = JSON.parse(jsonStr);

    // Debug parsed keys
    console.log("✅ Parsed keys:", Object.keys(json));

    return json;

  } catch (err) {
    console.error("❌ AI response is not valid JSON:", err.message);
    throw new Error("Failed to parse AI response as JSON.");
  }
};

