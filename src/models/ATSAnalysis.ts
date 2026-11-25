import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  userId: {type:mongoose.Schema.Types.ObjectId, required:true, ref:'User'},
  score: {type:Number,required:true,min:0,max:100},
  suggestions: [{type:String}],
  scoring_breakdown: {
    keyword_alignment:Number, experience_match:Number, skill_coverage:Number,
    achievement_quantification:Number, format_compliance:Number
  },
  scoringVersion: {type:String,required:true},
  keywordEvidence: {matched:[String],missing:[String]}
},{timestamps:true});
schema.index({userId:1,createdAt:-1,_id:-1});
export const ATSAnalysis = mongoose.model('ATSAnalysis',schema);
