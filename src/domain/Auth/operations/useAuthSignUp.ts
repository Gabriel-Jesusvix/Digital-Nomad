import {
  useAppMutation,
  UseAppMutationOptions,
} from "@/src/infra/operations/useAppMutation";
import { useRepository } from "@/src/infra/repositories/RepositoryProvider";
import { AuthSignUpParams } from "../IAuthRepository";
import { useFeedbackService } from "@/src/infra/services/feedback/FeedbackProvider";

export function useAuthSignUp(options?: UseAppMutationOptions<void>) {
  const { auth } = useRepository();
  const feedbackService = useFeedbackService();

  return useAppMutation<void, AuthSignUpParams>({
    mutateFn: (params) => auth.signUp(params),
    onSuccess: () => {
      options?.onSuccess?.();
      feedbackService.send({
        type: "success",
        message: `cadastro feito com sucesso`,
      });
    },
    onError: (error) => {
      options?.onError?.(error);
      feedbackService.send({ type: "error", message: "erro ao cadastrar" });
    },
  });
}