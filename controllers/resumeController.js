// controllers/resumeController.js
import { extractTextFromPDF } from "../services/pdfParser.js";
import { parseResumeWithAI } from "../services/aiService.js";
import User from "../models/User.js";

export const handleResumeUpload = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No resume file uploaded" });
    }

    const resumeText = await extractTextFromPDF(req.file.buffer);

    const parsedProfile = await parseResumeWithAI(resumeText);
    if (!parsedProfile || typeof parsedProfile !== "object") {
      return res.status(400).json({ message: "Resume parsing failed or returned invalid format." });
    }

    const {
      name,
      phone,
      dob,
      gender,
      nationality,
      portfolio,
      address,
      technicalSkills = [],
      softSkills = [],
      tools = [],
      languages = [],
      education = [],
      workExperience = [],
      projects = [],
      certifications = [],
      achievements = [],
      jobPreferences = {},
      github,
      linkedin,
    } = parsedProfile;
    console.log("Parsed profile data:", parsedProfile);

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          name,
          "profile.phone": phone,
          "profile.dob": dob,
          "profile.gender": gender,
          "profile.nationality": nationality,
          "profile.portfolio": portfolio,
          "profile.address": address,
          "profile.skills.technicalSkills": technicalSkills,
          "profile.skills.softSkills": softSkills,
          "profile.skills.tools": tools,
          "profile.skills.languages": languages,
          "profile.education": education,
          "profile.experience": workExperience,
          "profile.projects": projects,
          "profile.certifications": certifications,
          "profile.achievements": achievements,
          "profile.github": github,
          "profile.linkedin": linkedin,
          jobPreferences,
        },
      },
      { new: true }
    );
    console.log("Updated user profile:", updatedUser);

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      message: "Profile updated successfully from resume",
      user: updatedUser,
    });

  } catch (err) {
    console.error("Error uploading/parsing resume:", err);
    res.status(500).json({ message: "Failed to parse and update profile" });
  }
};
