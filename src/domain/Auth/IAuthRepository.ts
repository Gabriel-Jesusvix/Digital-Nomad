import { AuthUser } from "./AuthUser";

export interface IAuthRepository {
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signOut: () => Promise<void>;
  sendResetPasswordEmail: (email: string) => Promise<void>;
}