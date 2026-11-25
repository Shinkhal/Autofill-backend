import { extractTextFromPDF } from '../services/pdfParser.js';
import { getATSFeedback, parseResumeWithAI } from '../services/aiService.js';
import User from '../models/User.js';

export const analyzeResume = async (req, res) => {
  try {
    const fileBuffer = req.file?.buffer;
    const { jd } = req.body;

    if (!fileBuffer || !jd) {
      return res.status(400).json({ 
        success: false,
        error: "Resume file and job description are required." 
      });
    }
    const userId = req.user._id;
    const user = await User.findById(userId);

    if(user.resumeChecks >=5 ){
      return res.status(400).json({
        success: false,
        error: "You have reached the maximum number of resume checks for this month.",
        code: "FREE_LIMIT_REACHED"
      })
    }

    // Extract raw text from uploaded PDF resume
    const resumeText = await extractTextFromPDF(fileBuffer);

    // Parse the resume text into structured JSON
    const parsedResume = await parseResumeWithAI(resumeText);

    // Get ATS scoring feedback based on resume text and JD
    const feedback = await getATSFeedback(resumeText, jd);

    user.resumeChecks +=1;
    await user.save();

    // Send both parsed resume and ATS feedback in response
    res.status(200).json({
      success: true,
      ...feedback
    });

  } catch (err) {
    console.error("❌ Analysis failed:", err.message);
    
    // Handle specific error types and send appropriate responses to frontend
    if (err.message.includes("doesn't appear to be a resume")) {
      return res.status(400).json({ 
        success: false,
        error: "The uploaded document doesn't appear to be a resume. Please upload a valid resume with sections like experience, education, and skills.",
        code: "INVALID_RESUME_FORMAT"
      });
    }
    
    if (err.message.includes("Failed to extract text from PDF")) {
      return res.status(400).json({ 
        success: false,
        error: "Unable to extract text from the PDF. Please ensure the file is a valid, readable PDF.",
        code: "PDF_EXTRACTION_ERROR"
      });
    }
    
    if (err.message.includes("quota") || err.message.includes("rate limit")) {
      return res.status(429).json({ 
        success: false,
        error: "Service temporarily unavailable due to high demand. Please try again in a few minutes.",
        code: "RATE_LIMIT_ERROR"
      });
    }
    
    if (err.message.includes("ATS analysis failed")) {
      return res.status(500).json({ 
        success: false,
        error: "Failed to analyze resume compatibility. Please try again.",
        code: "ATS_ANALYSIS_ERROR"
      });
    }
    
    // Generic error for any other issues
    res.status(500).json({ 
      success: false,
      error: "Failed to analyze resume. Please try again.",
      code: "INTERNAL_ERROR"
    });
  }
};


//functi