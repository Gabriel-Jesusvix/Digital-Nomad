
import { AuthUser } from "@/src/domain/Auth/AuthUser";
import { authUsers } from "./data/authUsers";
import { IAuthRepository } from "@/src/domain/Auth/IAuthRepository";

export class inMemoryAuthRepository implements IAuthRepository {
  async signIn(email: string, password: string): Promise<AuthUser> {
    const user = authUsers.find((user) => user.email === email);
    if (user) {
      return user;
    }

    throw new Error("user not found");
  }

  async signOut(): Promise<void> {
    //
  }

  async sendResetPasswordEmail(email: string): Promise<void> {
    console.log("the reset password has been sent:", email);
  }
}