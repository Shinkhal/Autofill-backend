import User from "../models/User.js";

export const getprofile = async(req,res) =>{
    try{
        const user = await User.findById(req.params.id).select("-__v");
        if(!user)return res.status(400).json({message:"User not found"});
        return res.status(200).json(user);
    }
    catch(err){
        res.status(500).json({message:err.message});
    }
}

export const updateProfile = async(req,res)=>{
    try{
        const updates = req.body;
        const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true , runValidators: true});
        if(!user) return res.status(400).json({message:"User not found"});
        return res.status(200).json({message:"Profile updated successfully", user});
    }catch(err){
        res.status(500).json({message:err.message});
    }
}