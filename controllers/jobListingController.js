import striptags from 'striptags';

const safeJson = async (response, name) => {
  if (!response.ok) {
    console.error(`${name} returned status ${response.status}`);
    return [];
  }

  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    console.error(`${name} did not return JSON. Content-Type: ${contentType}`);
    return [];
  }

  try {
    return await response.json();
  } catch (err) {
    console.error(`${name} failed to parse JSON`, err);
    return [];
  }
};

// Controller to get all job listings with enhanced filtering
export const getAllJobListings = async (req, res) => {
  const { 
    query = 'developer', 
    location = '', 
    work_from_home = false,
    employment_types = '',
    job_requirements = '',
    company_types = '',
    radius = 25
  } = req.query;

  const headers = {
    'x-rapidapi-key': process.env.RAPIDAPI_KEY,
    'x-rapidapi-host': 'jsearch.p.rapidapi.com',
  };

  // Enhanced JSearch URL with all available parameters
  let jsearchURL = `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(query)}`;
  if (location) jsearchURL += `%20${encodeURIComponent(location)}`;
  jsearchURL += `&num_pages=1&country=in&date_posted=all&radius=${radius}`;
  
  if (work_from_home === 'true' || work_from_home === true) {
    jsearchURL += '&remote_jobs_only=true';
  }
  
  if (employment_types) {
    jsearchURL += `&employment_types=${encodeURIComponent(employment_types)}`;
  }
  
  if (job_requirements) {
    jsearchURL += `&job_requirements=${encodeURIComponent(job_requirements)}`;
  }
  
  if (company_types) {
    jsearchURL += `&company_types=${encodeURIComponent(company_types)}`;
  }

  const jobicyURL = `https://jobicy.com/api/v2/remote-jobs`;
  const remotiveURL = `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(query)}`;
  const joobleURL = `https://jooble.org/api/${process.env.JOOBLE_API_KEY}`;

  try {
    const [jsearchRes, jobicyRes, remotiveRes] = await Promise.all([
      fetch(jsearchURL, { headers }),
      fetch(jobicyURL),
      fetch(remotiveURL),
    ]);

    const joobleRes = await fetch(joobleURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keywords: query, location: location || 'India' }),
    });

    // Safely parse JSON responses
    const jsearchData = await safeJson(jsearchRes, 'JSearch');
    const jobicyData = await safeJson(jobicyRes, 'Jobicy');
    const remotiveData = await safeJson(remotiveRes, 'Remotive');
    const joobleData = await safeJson(joobleRes, 'Jooble');

    // Normalize JSearch with complete data
    const jsearchJobs = (jsearchData.data || []).map((job) => ({
      source: 'JSearch',
      jobId: job.job_id,
      company: job.employer_name,
      companyLogo: job.employer_logo,
      companyWebsite: job.employer_website,
      companyType: job.employer_company_type,
      role: job.job_title,
      location: job.job_city || job.job_country,
      country: job.job_country,
      state: job.job_state,
      city: job.job_city,
      description: job.job_description,
      highlights: job.job_highlights,
      qualifications: job.job_qualifications,
      responsibilities: job.job_responsibilities,
      benefits: job.job_benefits,
      applyLink: job.job_apply_link,
      postedDate: job.job_posted_at_datetime_utc,
      expirationDate: job.job_offer_expiration_datetime_utc,
      employmentType: job.job_employment_type,
      jobRequiredExperience: job.job_required_experience,
      jobRequiredSkills: job.job_required_skills,
      jobRequiredEducation: job.job_required_education,
      isRemote: job.job_is_remote,
      salaryMin: job.job_min_salary,
      salaryMax: job.job_max_salary,
      salaryCurrency: job.job_salary_currency,
      salaryPeriod: job.job_salary_period,
      jobGoogleLink: job.job_google_link,
      jobOfferExpirationTimestamp: job.job_offer_expiration_timestamp,
      jobPostedAtTimestamp: job.job_posted_at_timestamp,
      estimatedSalaries: job.estimated_salaries,
      applyOptions: job.apply_options
    }));

    // Normalize Jobicy with complete data
    const jobicyJobs = (jobicyData.jobs || [])
      .filter((job) => job.location?.toLowerCase().includes('india'))
      .map((job) => ({
        source: 'Jobicy',
        jobId: job.id,
        company: job.company_name,
        companyLogo: job.company_logo,
        role: job.title,
        location: job.location,
        description: job.description,
        jobType: job.job_type,
        category: job.category,
        applyLink: job.url,
        postedDate: job.posted_at,
        updatedDate: job.updated_at,
        tags: job.tags,
        salary: job.salary,
        isActive: job.is_active
      }));

    // Normalize Remotive with complete data
    const remotiveJobs = (remotiveData.jobs || [])
      .filter((job) =>
        job.candidate_required_location
          ?.toLowerCase()
          .includes('india')
      )
      .map((job) => ({
        source: 'Remotive',
        jobId: job.id,
        company: job.company_name,
        companyLogo: job.company_logo,
        companyLogoUrl: job.company_logo_url,
        role: job.title,
        location: job.candidate_required_location,
        description: striptags(job.description),
        applyLink: job.url,
        postedDate: job.publication_date,
        category: job.category,
        jobType: job.job_type,
        salary: job.salary,
        tags: job.tags,
        companyDescription: job.company_description,
        relativeLocation: job.relative_location,
        candidateRequiredLocation: job.candidate_required_location
      }));

    // Normalize Jooble with complete data
    const joobleJobs = (joobleData.jobs || [])
      .filter((job) => job.location?.toLowerCase().includes('india'))
      .map((job) => ({
        source: 'Jooble',
        jobId: job.id,
        company: job.company,
        role: job.title,
        location: job.location,
        description: striptags(job.snippet),
        applyLink: job.link,
        postedDate: job.updated,
        salary: job.salary,
        type: job.type,
        source_website: job.source
      }));

    // Combine all jobs into one array
    const allJobs = [
      ...jsearchJobs,
      ...jobicyJobs,
      ...remotiveJobs,
      ...joobleJobs,
    ];

    res.status(200).json({
      success: true,
      totalJobs: allJobs.length,
      jobs: allJobs,
      sources: {
        jsearch: jsearchJobs.length,
        jobicy: jobicyJobs.length,
        remotive: remotiveJobs.length,
        jooble: joobleJobs.length
      }
    });
  } catch (error) {
    console.error('Failed to fetch jobs:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch jobs', 
      error: error.message 
    });
  }
};

// Controller to get a specific job by ID from any source
export const getJobById = async (req, res) => {
  const { source, id } = req.params;

  if (!id || !source) {
    return res.status(400).json({
      success: false,
      message: 'Job ID and source are required'
    });
  }

  const headers = {
    'x-rapidapi-key': process.env.RAPIDAPI_KEY,
    'x-rapidapi-host': 'jsearch.p.rapidapi.com',
  };

  try {
    let jobData = null;

    switch (source.toLowerCase()) {
      case 'jsearch':
        const jsearchURL = `https://jsearch.p.rapidapi.com/job-details?job_id=${encodeURIComponent(id)}`;
        const jsearchRes = await fetch(jsearchURL, { headers });
        const jsearchData = await safeJson(jsearchRes, 'JSearch Job Detail');
        
        if (jsearchData.data && jsearchData.data.length > 0) {
          const job = jsearchData.data[0];
          jobData = {
            source: 'JSearch',
            jobId: job.job_id,
            company: job.employer_name,
            companyLogo: job.employer_logo,
            companyWebsite: job.employer_website,
            companyType: job.employer_company_type,
            role: job.job_title,
            location: job.job_city || job.job_country,
            country: job.job_country,
            state: job.job_state,
            city: job.job_city,
            description: job.job_description,
            highlights: job.job_highlights,
            qualifications: job.job_qualifications,
            responsibilities: job.job_responsibilities,
            benefits: job.job_benefits,
            applyLink: job.job_apply_link,
            postedDate: job.job_posted_at_datetime_utc,
            expirationDate: job.job_offer_expiration_datetime_utc,
            employmentType: job.job_employment_type,
            jobRequiredExperience: job.job_required_experience,
            jobRequiredSkills: job.job_required_skills,
            jobRequiredEducation: job.job_required_education,
            isRemote: job.job_is_remote,
            salaryMin: job.job_min_salary,
            salaryMax: job.job_max_salary,
            salaryCurrency: job.job_salary_currency,
            salaryPeriod: job.job_salary_period,
            jobGoogleLink: job.job_google_link,
            jobOfferExpirationTimestamp: job.job_offer_expiration_timestamp,
            jobPostedAtTimestamp: job.job_posted_at_timestamp,
            estimatedSalaries: job.estimated_salaries,
            applyOptions: job.apply_options,
            relatedLinks: job.related_links
          };
        }
        break;

      case 'jobicy':
        // Jobicy doesn't have a specific job detail endpoint, so we'll search their jobs list
        const jobicyURL = `https://jobicy.com/api/v2/remote-jobs`;
        const jobicyRes = await fetch(jobicyURL);
        const jobicyData = await safeJson(jobicyRes, 'Jobicy');
        
        const jobicyJob = (jobicyData.jobs || []).find(job => job.id.toString() === id);
        if (jobicyJob) {
          jobData = {
            source: 'Jobicy',
            jobId: jobicyJob.id,
            company: jobicyJob.company_name,
            companyLogo: jobicyJob.company_logo,
            role: jobicyJob.title,
            location: jobicyJob.location,
            description: jobicyJob.description,
            jobType: jobicyJob.job_type,
            category: jobicyJob.category,
            applyLink: jobicyJob.url,
            postedDate: jobicyJob.posted_at,
            updatedDate: jobicyJob.updated_at,
            tags: jobicyJob.tags,
            salary: jobicyJob.salary,
            isActive: jobicyJob.is_active,
            requirements: jobicyJob.requirements,
            benefits: jobicyJob.benefits
          };
        }
        break;

      case 'remotive':
        // Remotive also doesn't have a specific job detail endpoint
        const remotiveURL = `https://remotive.com/api/remote-jobs`;
        const remotiveRes = await fetch(remotiveURL);
        const remotiveData = await safeJson(remotiveRes, 'Remotive');
        
        const remotiveJob = (remotiveData.jobs || []).find(job => job.id.toString() === id);
        if (remotiveJob) {
          jobData = {
            source: 'Remotive',
            jobId: remotiveJob.id,
            company: remotiveJob.company_name,
            companyLogo: remotiveJob.company_logo,
            companyLogoUrl: remotiveJob.company_logo_url,
            role: remotiveJob.title,
            location: remotiveJob.candidate_required_location,
            description: remotiveJob.description, // Keep HTML for detailed view
            applyLink: remotiveJob.url,
            postedDate: remotiveJob.publication_date,
            category: remotiveJob.category,
            jobType: remotiveJob.job_type,
            salary: remotiveJob.salary,
            tags: remotiveJob.tags,
            companyDescription: remotiveJob.company_description,
            relativeLocation: remotiveJob.relative_location,
            candidateRequiredLocation: remotiveJob.candidate_required_location
          };
        }
        break;

      case 'jooble':
        // Jooble requires a search to find specific jobs
        const joobleURL = `https://jooble.org/api/${process.env.JOOBLE_API_KEY}`;
        const joobleRes = await fetch(joobleURL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keywords: '', location: 'India' }),
        });
        const joobleData = await safeJson(joobleRes, 'Jooble');
        
        const joobleJob = (joobleData.jobs || []).find(job => job.id.toString() === id);
        if (joobleJob) {
          jobData = {
            source: 'Jooble',
            jobId: joobleJob.id,
            company: joobleJob.company,
            role: joobleJob.title,
            location: joobleJob.location,
            description: joobleJob.snippet,
            applyLink: joobleJob.link,
            postedDate: joobleJob.updated,
            salary: joobleJob.salary,
            type: joobleJob.type,
            source_website: joobleJob.source
          };
        }
        break;

      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid source. Supported sources: jsearch, jobicy, remotive, jooble'
        });
    }

    if (!jobData) {
      return res.status(404).json({
        success: false,
        message: `Job with ID ${id} not found in ${source}`
      });
    }

    res.status(200).json({
      success: true,
      job: jobData
    });

  } catch (error) {
    console.error(`Failed to fetch job ${id} from ${source}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch job details',
      error: error.message
    });
  }
};

// Controller to get estimated salaries for a job (JSearch specific)
export const getJobSalaries = async (req, res) => {
  const { job_title, location = 'India', radius = 100 } = req.query;

  if (!job_title) {
    return res.status(400).json({
      success: false,
      message: 'Job title is required'
    });
  }

  const headers = {
    'x-rapidapi-key': process.env.RAPIDAPI_KEY,
    'x-rapidapi-host': 'jsearch.p.rapidapi.com',
  };

  try {
    const salaryURL = `https://jsearch.p.rapidapi.com/estimated-salary?job_title=${encodeURIComponent(job_title)}&location=${encodeURIComponent(location)}&radius=${radius}`;
    const salaryRes = await fetch(salaryURL, { headers });
    const salaryData = await safeJson(salaryRes, 'JSearch Salary');

    res.status(200).json({
      success: true,
      salaryData: salaryData.data || []
    });

  } catch (error) {
    console.error('Failed to fetch salary data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch salary data',
      error: error.message
    });
  }
};