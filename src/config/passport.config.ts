import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { getEnv } from './env.config.js';

export function configurePassport(): void {
  passport.use(new GoogleStrategy({
    clientID: getEnv.google.clientId(),
    clientSecret: getEnv.google.clientSecret(),
    callbackURL: new URL('/auth/google/callback', getEnv.app.url()).href,
    state: true
  }, (_accessToken, _refreshToken, profile, done) => done(null, profile)));
}
