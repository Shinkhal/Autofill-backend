import mongoose from 'mongoose';


const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI,{
        dbName:"jobautofill"
    }

    );
    console.log(`✅ MongoDB Connected successfully`);
  } catch (error) {
    console.error('❌ MongoDB Error:', error.message);
    process.exit(1);
  }
};

export default connectDB;
