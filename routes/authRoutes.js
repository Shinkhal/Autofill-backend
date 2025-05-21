import express from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = express.Router();

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));


router.get('/google/callback', passport.authenticate('google', {
  failureRedirect: '/',
  session: false
}), async (req, res) => {
  const profile = req.user;

  const googleId = profile.id;
  const name = profile.displayName;
  const email = profile.emails[0].value;
  const image = profile.photos[0].value;

  let user = await User.findOne({ googleId });

  if (!user) {
    user = await User.create({ googleId, name, email, image });
  }

  const token = jwt.sign(
    { id: user._id, email: user.email, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.redirect(`${process.env.CLIENT_URL}/auth-success?token=${token}`);
});


export default router;
