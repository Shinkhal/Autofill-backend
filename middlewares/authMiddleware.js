import jwt from 'jsonwebtoken';
import User from '../models/User.js'; // make sure this path is correct

export const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // This assumes your token has: { userId: user._id }
    req.user = await User.findById(decoded.userId).select('-password');

    if (!req.user) {
      return res.status(404).json({ message: 'User not found in database' });
    }
    next();
  } catch (err) {
    console.error('JWT verification error:', err);
    return res.status(401).json({ message: 'Unauthorized: Invalid or expired token' });
  }
};
