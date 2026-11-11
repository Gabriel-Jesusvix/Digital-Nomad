import { Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthGetUser } from "@/src/domain/Auth/operations/useAuthGetUser";
import { useAuthSignOut } from "@/src/domain/Auth/operations/useAuthSignOut";
import { Box } from "@/src/ui/components/Box";
import { Icon } from "@/src/ui/components/Icon";
import { Screen } from "@/src/ui/components/Screen";
import { Text } from "@/src/ui/components/Text";
import { ProfileHeader } from "@/src/ui/containers/Profile/ProfileHeader";
import { FavoriteCityList } from "@/src/ui/containers/Profile/FavoriteCityList";

export default function Profile() {
  const { mutate: signOut } = useAuthSignOut();
  const { data: authUser } = useAuthGetUser();
  return (
    <Screen>
      <FavoriteCityList
        ListHeaderComponent={authUser && <ProfileHeader authUser={authUser} />}
        ListFooterComponent={
          <Pressable onPress={signOut}>
            <Box
              mt="s24"
              flexDirection="row"
              alignItems="center"
              alignSelf="center"
            >
              <Icon name="Logout" color="fbErrorSurface" />
              <Text color="fbErrorSurface">Sair</Text>
            </Box>
          </Pressable>
        }
      />
    </Screen>
  )
}