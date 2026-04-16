import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { AuthUser, JwtPayload } from "@multilang-call/shared";
import { nanoid } from "nanoid";
import { prisma } from "./meetingService.js";

type UserRole = AuthUser["role"];

const jwtSecret =
  process.env.JWT_SECRET ?? "change_this_to_a_long_random_string_min_32_chars";
const jwtExpiresIn = process.env.JWT_EXPIRES_IN ?? "7d";

type UserRow = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role: UserRole;
};

const mapUser = (user: UserRow): AuthUser => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  role: user.role
});

export const createAuthToken = (user: AuthUser) =>
  jwt.sign(
    {
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role
    } satisfies JwtPayload,
    jwtSecret,
    { expiresIn: jwtExpiresIn as jwt.SignOptions["expiresIn"] }
  );

export const registerUser = async (
  email: string,
  displayName: string,
  password: string,
  role: UserRole
) => {
  const passwordHash = await bcrypt.hash(password, 12);
  const id = nanoid(24);
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO User (id, email, displayName, passwordHash, role, createdAt)
      VALUES (?, ?, ?, ?, ?, NOW())
    `,
    id,
    email,
    displayName,
    passwordHash,
    role
  );

  return {
    id,
    email,
    displayName,
    role
  } satisfies AuthUser;
};

export const loginUser = async (email: string, password: string) => {
  const rows = await prisma.$queryRawUnsafe<UserRow[]>(
    `
      SELECT id, email, displayName, passwordHash, role
      FROM User
      WHERE email = ?
      LIMIT 1
    `,
    email
  );
  const user = rows[0];

  if (!user) {
    throw new Error("Invalid email or password");
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    throw new Error("Invalid email or password");
  }

  const authUser = mapUser(user);
  return {
    user: authUser,
    token: createAuthToken(authUser)
  };
};

export const verifyToken = (token: string) =>
  jwt.verify(token, jwtSecret) as JwtPayload;
