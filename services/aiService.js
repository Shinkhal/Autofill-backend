// aiService.js - Drop-in replacements for your existing functions
import { GoogleGenAI } from "@google/genai";
import { z } from 'zod';
import dotenv from "dotenv";
dotenv.config();

const genAI = new GoogleGenAI({
  apiKey: process.env.GOOGLE_GEMINI_API_KEY,
});

// Enhanced validation schema (optional - can be removed if you don't want validation)
const ParsedResumeSchema = z.object({
  fullName: z.string().default(""),
  phone: z.string().default(""),
  email: z.string().default(""),
  education: z.array(z.object({
    institution: z.string().default(""),
    degree: z.string().default(""),
    fieldOfStudy: z.string().default(""),
    graduationYear: z.string().default(""),
    gpa: z.string().default("")
  })).default([]),
  workExperience: z.array(z.object({
    jobTitle: z.string().default(""),
    company: z.string().default(""),
    employmentType: z.string().default(""),
    startDate: z.string().default(""),
    endDate: z.string().default(""),
    isCurrentJob: z.boolean().default(false),
    jobDescription: z.string().default(""),
    achievements: z.array(z.string()).default([])
  })).default([]),
  technicalSkills: z.array(z.string()).default([]),
  softSkills: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
  certifications: z.array(z.object({
    name: z.string().default(""),
    issuingOrganization: z.string().default(""),
    issueDate: z.string().default("")
  })).default([]),
  achievements: z.array(z.string()).default([]),
  projects: z.array(z.object({
    name: z.string().default(""),
    description: z.string().default(""),
    technologies: z.array(z.string()).default([]),
    link: z.string().default("")
  })).default([]),
  linkedin: z.string().default(""),
  github: z.string().default("")
});

const ATSFeedbackSchema = z.object({
  score: z.number().min(0).max(100),
  suggestions: z.array(z.string().min(20)).min(3).max(5),
  scoring_breakdown: z.object({
    keyword_alignment: z.number().min(0).max(30),
    experience_match: z.number().min(0).max(25),
    skill_coverage: z.number().min(0).max(20),
    achievement_quantification: z.number().min(0).max(15),
    format_compliance: z.number().min(0).max(10),
  }),
});

const extractJsonFromResponse = (text) => {
  if (!text) throw new Error("Empty response from AI");
  let cleaned = text
    .replace(/^```(?:json)?/gmi, '')
    .replace(/```$/gm, '')
    .replace(/^json\s*/i, '')
    .trim();
  
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("No valid JSON object found in response");
  }
  
  let jsonStr = cleaned.slice(firstBrace, lastBrace + 1);
  jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');
  return jsonStr;
};

// Improved parseResumeWithAI - Drop-in replacement for your existing function
export const parseResumeWithAI = async (resumeText) => {
  // Enhanced validation with more keywords
  const isLikelyResume = (text) => {
    if (!text || text.length < 100) return false;
    
    const requiredKeywords = ["experience", "education", "skills", "projects", "certifications", "work", "job"];
    const optionalKeywords = ["university", "college", "degree", "email", "phone", "linkedin", "github"];
    
    const textLower = text.toLowerCase();
    const requiredMatches = requiredKeywords.filter((kw) => textLower.includes(kw));
    const optionalMatches = optionalKeywords.filter((kw) => textLower.includes(kw));
    
    return requiredMatches.length >= 2 || (requiredMatches.length >= 1 && optionalMatches.length >= 2);
  };

  if (!isLikelyResume(resumeText)) {
    throw new Error("Uploaded document doesn't appear to be a resume.");
  }

  // Enhanced prompt with better instructions
  const fullPrompt = `
You're a resume parsing assistant. Extract the following structured data from the resume text and return it as a clean JSON object. 

CRITICAL INSTRUCTIONS:
- Return ONLY valid JSON (no explanations, markdown, or extra text)
- DO NOT use triple backticks or code blocks
- Include ALL fields, even if they are empty or not present in the resume
- Use empty strings for missing text fields, empty arrays for missing list fields
- Extract phone numbers without special characters when possible
- Separate technical skills, soft skills, and tools clearly
- For work experience, extract achievements as separate items in the achievements array

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

  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await genAI.models.generateContent({
        model: "gemini-2.0-flash-exp", // Using the more stable model
        contents: [
          {
            role: "user",
            parts: [{ text: fullPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.1, // Lower temperature for more consistent output
        },
      });

      let text = response?.candidates?.[0]?.content?.parts?.[0]?.text || "";

      if (!text) {
        throw new Error("Empty response from AI service");
      }

      // Use the improved JSON extraction
      const jsonStr = extractJsonFromResponse(text);
      const json = JSON.parse(jsonStr);

      // Optional: Validate with schema (comment out if you don't want validation)
      try {
        const validatedData = ParsedResumeSchema.parse(json);
        return validatedData;
      } catch (validationError) {
        // If validation fails, return the raw JSON (maintains backward compatibility)
        console.warn("Schema validation failed, returning raw data:", validationError.message);
        return json;
      }

    } catch (err) {
      lastError = err;
      console.error(`Resume parsing attempt ${attempt} failed:`, err.message);
      
      if (attempt < maxRetries) {
        // Wait before retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  console.error("❌ AI response parsing failed after all retries:", lastError.message);
  throw new Error("Failed to parse AI response as JSON.");
};

// Improved getATSFeedback - Drop-in replacement for your existing function
export const getATSFeedback = async (resumeText, jd) => {
  // Input validation
  if (!resumeText || !jd) {
    throw new Error("Both resume text and job description are required");
  }

  if (resumeText.length < 50 || jd.length < 50) {
    throw new Error("Resume text and job description must be substantial for analysis");
  }

  const prompt = `
SYSTEM: You are an ATS scoring expert. Follow these instructions STRICTLY:

1. Score the resume against the job description (JD) using these weighted criteria:
   - Keyword Alignment (30%): Exact matches of JD keywords and skills.
   - Experience Match (25%): Relevant years, role specificity, and industry experience.
   - Skill Coverage (20%): Ratio of required vs optional skills covered.
   - Achievement Quantification (15%): Use of metrics, percentages, and concrete achievements.
   - Format Compliance (10%): How ATS-friendly the resume format is.

2. Deduct points for these issues:
   - Missing required JD keywords: deduct 5% per critical missing keyword.
   - Generic or vague statements: deduct 2% each.
   - Unexplained employment gaps longer than 3 months: deduct 1% per month over 3 months.
   - Format errors or readability issues: deduct 3% per issue.

3. Handle edge cases carefully:
   - If the resume is very short or incomplete, score lower and suggest adding more detailed work experience and skills.
   - If the resume contains irrelevant information unrelated to the JD, deduct points accordingly and suggest removing or replacing it.
   - If the resume has inconsistent date formats or missing dates for jobs, deduct points and suggest fixing date information.
   - If there are spelling or grammatical errors detected, deduct points and suggest proofreading.
   - If technical skills or certifications are mentioned but not clearly linked to the JD, score skill coverage accordingly and recommend clarifying relevance.
   - If the resume uses unusual fonts, layouts, or images that might confuse ATS parsing, deduct format compliance points and suggest simplification.

4. Provide your output STRICTLY as JSON matching the following schema EXACTLY:

{
  "score": 78.5,
  "suggestions": [
    "Add 5+ ML keywords from JD like 'machine learning', 'Python', 'data science'",
    "Quantify achievements with specific metrics (e.g., 'increased efficiency by 25%')",
    "Improve formatting for ATS parsing - use standard fonts and simple layout",
    "Fix inconsistent date formats in work experience section",
    "Remove irrelevant hobbies section and add more relevant technical skills"
  ],
  "scoring_breakdown": {
    "keyword_alignment": 22.5,
    "experience_match": 19.0,
    "skill_coverage": 15.5,
    "achievement_quantification": 12.0,
    "format_compliance": 9.5
  }
}

USER INPUT:
Resume: ${resumeText}

Job Description: ${jd}

IMPORTANT: Return ONLY the JSON object, no other text.
`.trim();

  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await genAI.models.generateContent({
        model: "gemini-2.0-flash-exp",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      });

      let text = response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

      if (!text) {
        throw new Error("Empty response from AI service");
      }

      // Use improved JSON extraction
      const jsonStr = extractJsonFromResponse(text);
      const parsedData = JSON.parse(jsonStr);

      // Validate the response structure
      const validation = ATSFeedbackSchema.safeParse(parsedData);
      if (!validation.success) {
        throw new Error(
          `Response validation failed: ${validation.error.errors
            .map((e) => `${e.path.join('.')} ${e.message}`)
            .join(", ")}`
        );
      }

      // Additional validation: check if breakdown scores sum approximately to total score
      const breakdownSum = Object.values(validation.data.scoring_breakdown)
        .reduce((sum, score) => sum + score, 0);
      
      if (Math.abs(breakdownSum - validation.data.score) > 3) {
        console.warn(`Score mismatch: breakdown sum ${breakdownSum} vs total ${validation.data.score}`);
        // Fix the total score to match breakdown
        validation.data.score = Math.round(breakdownSum * 10) / 10;
      }

      return validation.data;

    } catch (err) {
      lastError = err;
      console.error(`ATS feedback attempt ${attempt} failed:`, err.message);
      
      if (attempt < maxRetries) {
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  console.error("❌ ATS analysis failed after all retries:", lastError.message);
  throw new Error("ATS analysis failed: " + lastError.message);
};

