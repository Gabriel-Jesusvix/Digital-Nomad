import { useAppMutation } from "@/src/infra/operations/useAppMutation";
import { useRepository } from "@/src/infra/repositories/RepositoryProvider";
import { AuthUser } from "../AuthUser";
import { useFeedbackService } from "@/src/infra/services/feedback/FeedbackProvider";
import { useAuth } from "../AuthContext";

export function useAuthSignIn() {
  const { auth } = useRepository();
  const feedbackService = useFeedbackService();
  const { saveAuthUser } = useAuth();

  return useAppMutation<AuthUser, { email: string; password: string }>({
    mutateFn: ({ email, password }) => auth.signIn(email, password),
    onSuccess: (authUser) => {
      saveAuthUser(authUser);
      feedbackService.send({
        type: "success",
        message: `signed in: ${authUser.email}`,
      });
    },
    onError: (error) => {
      feedbackService.send({
        type: "error",
        message: "error ao fazer login",
        //@ts-ignore
        description: error.message,
      });
    },
  });
}