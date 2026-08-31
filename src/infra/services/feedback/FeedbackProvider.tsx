import { use, createContext } from "react";
import { IFeedbackService } from "./IFeedbackService";

export const FeedbackContext = createContext<IFeedbackService>(
  {} as IFeedbackService // > export const RepositoryContext = createContext<IFeedbackService | undefined>(undefined);
);

export const FeedbackProvider = FeedbackContext.Provider;

export function useFeedbackService(): IFeedbackService {
  const context = use(FeedbackContext);

  if (!context) {
    throw new Error(
      "Feedback Context should be used within a FeedbackProvider"
    );
  }

  return context;
}