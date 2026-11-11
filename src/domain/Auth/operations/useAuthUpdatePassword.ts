import {
  useAppMutation,
  UseAppMutationOptions,
} from "@/src/infra/operations/useAppMutation";
import { AuthUpdatePasswordParams } from "../IAuthRepository";
import { useRepository } from "@/src/infra/repositories/RepositoryProvider";
import { useFeedbackService } from "@/src/infra/services/feedback/FeedbackProvider";

export function useAuthUpdatePassword(options?: UseAppMutationOptions<void>) {
  const { auth } = useRepository();
  const feedbackService = useFeedbackService();

  return useAppMutation<void, AuthUpdatePasswordParams>({
    mutationFn: (params) => auth.updatePassword(params),
    onSuccess: () => {
      options?.onSuccess?.();
      feedbackService.send({
        type: "success",
        message: `senha atualizada com sucesso`,
      });
    },
    onError: (error) => {
      options?.onError?.(error);
      feedbackService.send({
        type: "error",
        message: "erro ao atualizar senha",
      });
    },
  });
}