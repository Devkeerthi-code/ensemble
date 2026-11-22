import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { rateLimit } from "@/lib/server/rate-limit";
import { audit } from "@/lib/server/telemetry";

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
  password: z.string().min(8, "Use at least 8 characters").max(128),
});

/** Same cost whether or not the user exists, so response time doesn't reveal registered emails. */
const DUMMY_HASH = "$2b$12$ZbSkTTVZUfH5uw2KpaYSGeW6/lUHu9U.OYFfajUpncJXUAormE.IW";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 14 },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const limited = await rateLimit(`login:${email}`, 8, 15 * 60);
        if (!limited.ok) return null;
        const user = await db.user.findUnique({ where: { email }, select: { id: true, email: true, passwordHash: true } });
        const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
        if (!user || !valid) {
          await audit("login_failed", { target: user ? user.id : undefined });
          return null;
        }
        await audit("login", { userId: user.id });
        return { id: user.id, email: user.email };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
