import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import connectDB  from './config/db.js';
import passport from 'passport';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import './config/passport.js';
import authRoutes from './routes/authRoutes.js';
import resumeRoutes from './routes/resumeRoutes.js';
import userRoutes from './routes/userRoutes.js';


dotenv.config();
connectDB();

const app = express();

// app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(cors({
    origin: '*',
    credentials: true,
}))
app.use(express.json());

app.get('/', (req, res) => {
  res.send('API is running...');
});

app.use(cookieParser());
app.use(session({ secret: process.env.JWT_SECRET, resave: false, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());
app.use('/auth', authRoutes);
app.use('/api/resume', resumeRoutes);
app.use('/api/user', userRoutes);

const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`Server is running on ${PORT}`);
});