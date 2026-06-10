import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import prisma from './prisma';
import { config } from './config';

export const googleOAuthEnabled = !!(config.google.clientId && config.google.clientSecret);

if (googleOAuthEnabled) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: config.google.clientId,
        clientSecret: config.google.clientSecret,
        callbackURL: config.google.callbackUrl,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const googleId = profile.id;
          const email = profile.emails?.[0]?.value ?? `${googleId}@google.com`;
          const name = profile.displayName || 'Hacker';
          const avatar = profile.photos?.[0]?.value ?? null;

          // 1. Try to find by googleId first
          let user = await prisma.user.findUnique({ where: { googleId } });

          if (!user) {
            // 2. Maybe they registered with email/password before — link accounts
            user = await prisma.user.findUnique({ where: { email } });

            if (user) {
              // Link the existing account to Google
              user = await prisma.user.update({
                where: { id: user.id },
                data: { googleId, avatar },
              });
            } else {
              // 3. Brand new user — create with starter XP & badges
              user = await prisma.user.create({
                data: {
                  email,
                  name,
                  googleId,
                  avatar,
                  passwordHash: null,
                  role: 'Developer',
                  xp: 10,
                  badges: JSON.stringify(['Novice Hacker', 'Google Pioneer']),
                },
              });
            }
          } else if (avatar && user.avatar !== avatar) {
            // Keep avatar in sync with Google profile
            user = await prisma.user.update({
              where: { id: user.id },
              data: { avatar },
            });
          }

          return done(null, user);
        } catch (err) {
          return done(err as Error);
        }
      }
    )
  );
} else {
  console.warn('⚠️  Google OAuth is DISABLED — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env to enable it.');
}

// Serialize / deserialize for the transient OAuth session (not for app auth)
passport.serializeUser((user: any, done) => done(null, user.id));
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user);
  } catch (err) {
    done(err);
  }
});

export default passport;
