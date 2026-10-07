import HomeScreen from "@/app/(protected)/(tabs)";
import TabLayout from "@/app/(protected)/(tabs)/_layout";
import ExploreScreen from "@/app/(protected)/(tabs)/explore";
import ProfileScreen from "@/app/(protected)/(tabs)/profile";
import ProtectedLayout from "@/app/(protected)/_layout";
import CityDetails from "@/app/(protected)/city-details/[id]";
import SignInScreen from "@/app/sign-in";
import SignUpScreen from "@/app/sign-up";
import { renderRouter } from "expo-router/testing-library";
import { AppStack } from "../ui/navigation/AppStack";

import { ThemeProvider } from "@shopify/restyle";

import { InMemoryRepository } from "../infra/repositories/adapters/inMemory";
import { RepositoryProvider } from "../infra/repositories/RepositoryProvider";

import theme from "../ui/theme/theme";
import { ToastFeedback } from "../infra/services/feedback/adapters/Toast/ToastFeedback";
import { Toast } from "../infra/services/feedback/adapters/Toast/Toast";
import { FeedbackProvider } from "../infra/services/feedback/FeedbackProvider";
import { AuthContext, AuthProvider } from "../domain/Auth/AuthContext";
import { StorageProvider } from "../infra/services/storage/StorageContext";
import { inMemoryStorage } from "../infra/services/storage/adapters/InMemoryStorage";
import { AuthUser } from "../domain/Auth/AuthUser";
import NotFoundScreen from "@/app/+not-found";


function MockedAuthProvider({ children }: React.PropsWithChildren) {
  const authUser: AuthUser = {
    email: "lucas@coffstack.com",
    id: "1",
    fullname: "Lucas Garcez",
  };

  return (
    <AuthContext.Provider
      value={{
        isReady: true,
        authUser,
        saveAuthUser: async () => { },
        removeAuthUser: async () => { },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function renderApp(options?: { isAuthenticated?: boolean }) {

  const FinalAuthProvider = options?.isAuthenticated
    ? MockedAuthProvider
    : AuthProvider;

  function Wrapper({ children }: React.PropsWithChildren) {
    return (
      <StorageProvider storage={inMemoryStorage}>
        <FinalAuthProvider>
          <FeedbackProvider value={ToastFeedback}>
            <RepositoryProvider value={InMemoryRepository}>
              <ThemeProvider theme={theme}>
                {children}
                <Toast />
              </ThemeProvider>
            </RepositoryProvider>
          </FeedbackProvider>
        </FinalAuthProvider>
      </StorageProvider>
    );
  }

  renderRouter(
    {
      _layout: () => <AppStack />,
      "(protected)/_layout": () => <ProtectedLayout />,
      "(protected)/(tabs)/_layout": () => <TabLayout />,
      "(protected)/(tabs)/index": () => <HomeScreen />,
      "(protected)/(tabs)/explore": () => <ExploreScreen />,
      "(protected)/(tabs)/profile": () => <ProfileScreen />,
      "(protected)/city-details/[id]": () => <CityDetails />,
      "sign-in": () => <SignInScreen />,
      "sign-up": () => <SignUpScreen />,
      "+not-found": () => <NotFoundScreen />,
    },
    { wrapper: Wrapper, initialUrl: "/" }
  );
}