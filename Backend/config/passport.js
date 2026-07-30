import passport from "passport"
import { Strategy as GoogleStrategy } from "passport-google-oauth20"
import { Strategy as GitHubStrategy } from "passport-github2"
import User from "../models/User.js"

function hashToColor(str) {
  const COLORS = [
    "#EF4444", "#F97316", "#EAB308", "#22C55E",
    "#06B6D4", "#3B82F6", "#8B5CF6", "#EC4899",
    "#F43F5E", "#14B8A6", "#6366F1", "#A855F7",
  ]
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return COLORS[Math.abs(hash) % COLORS.length]
}

export function configurePassport() {
  passport.serializeUser((user, done) => {
    done(null, user._id)
  })

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id)
      done(null, user)
    } catch (error) {
      done(error, null)
    }
  })

  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "http://localhost:3000/auth/google/callback",
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          let user = await User.findOne({ googleId: profile.id })

          if (!user) {
            const email = profile.emails?.[0]?.value || ""
            user = email ? await User.findOne({ email }) : null

            if (user) {
              user.googleId = profile.id
              user.avatar = profile.photos?.[0]?.value || user.avatar
              await user.save()
            } else {
              user = await User.create({
                googleId: profile.id,
                username: profile.displayName.replace(/\s+/g, "_") + "_" + profile.id.slice(-4),
                email,
                avatar: profile.photos?.[0]?.value || "",
                color: hashToColor(profile.id),
                isGuest: false,
              })
            }
          } else {
            user.avatar = profile.photos?.[0]?.value || user.avatar
            await user.save()
          }

          return done(null, user)
        } catch (error) {
          return done(error, null)
        }
      }
    )
  )

  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: "http://localhost:3000/auth/github/callback",
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          let user = await User.findOne({ githubId: profile.id })

          if (!user) {
            const email = profile.emails?.[0]?.value || ""
            user = email ? await User.findOne({ email }) : null

            if (user) {
              user.githubId = profile.id
              user.avatar = profile.photos?.[0]?.value || user.avatar
              user.githubToken = accessToken
              await user.save()
            } else {
              user = await User.create({
                githubId: profile.id,
                username: profile.username + "_" + profile.id.slice(-4),
                email,
                avatar: profile.photos?.[0]?.value || "",
                color: hashToColor(profile.id),
                isGuest: false,
                githubToken: accessToken,
              })
            }
          } else {
            user.avatar = profile.photos?.[0]?.value || user.avatar
            user.githubToken = accessToken
            await user.save()
          }

          return done(null, user)
        } catch (error) {
          return done(error, null)
        }
      }
    )
  )
}

export default passport
