
import { AuthUser } from "@/src/domain/Auth/AuthUser";
import { authUsers } from "./data/authUsers";
import { AuthSignUpParams, IAuthRepository } from "@/src/domain/Auth/IAuthRepository";

export class inMemoryAuthRepository implements IAuthRepository {
  async signIn(email: string, password: string): Promise<AuthUser> {
    const user = authUsers.find((user) => user.email === email);
    if (user) {
      return user;
    }

    throw new Error("user not found");
  }

  async signUp(params: AuthSignUpParams): Promise<void> {
    const userAlreadyExist = authUsers.find(
      (user) => user.email === params.email
    );
    if (userAlreadyExist) {
      throw new Error("user already exist");
    }

    return;
  }

  async signOut(): Promise<void> {
    //
  }

  async sendResetPasswordEmail(email: string): Promise<void> {
    console.log("the reset password has been sent:", email);
  }
}