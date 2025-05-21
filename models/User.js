import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  googleId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  image: String,

  // Additional profile info user fills manually
  profile: {
    phone: String,
    dob: String,
    gender: String,
    nationality: String,
    portfolio: String,
    github: String,
    linkedin: String,

    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String
    },

    skills: {
      technicalSkills: [String],
      softSkills: [String],
      languages: [String],
      tools: [String]
    },

    education: [
      {
        degree: String,
        fieldOfStudy: String,
        institution: String,
        startDate: String,
        endDate: String,
        gpa: String,
      }
    ],

    experience: [
      {
        jobTitle: String,
        company: String,
        employmentType: String,
        startDate: String,
        endDate: String,
        jobDescription: String,
      }
    ],

    projects: [
      {
        name: String,
        description: String,
        technologies: [String],
        link: String
      }
    ],

    certifications: [
      {
        name: String,
        issuingOrganization: String,
        issueDate: String
      }
    ],

    achievements: [String],
  },

  jobPreferences: {
    desiredRoles: String,
    workLocation: String,
    jobType: String,
    expectedSalary: String,
    noticePeriod: String,
    relocate: String,
    visaSponsorship: String,
    preferredIndustries: [String],
    travelWillingness: String
  }

}, { timestamps: true });

export default mongoose.model('User', userSchema);
