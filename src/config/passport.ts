import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { env } from './env.js';

export function configurePassport(): void {
  passport.use(new GoogleStrategy({
    clientID: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    callbackURL: new URL('/auth/google/callback', env.SERVER_URL).href,
    state: true
  }, (_accessToken, _refreshToken, profile, done) => done(null, profile)));
}
